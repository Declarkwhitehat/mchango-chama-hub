import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { PaymentCountdownTimer } from "./PaymentCountdownTimer";
import { AmountToPayCard } from "./AmountToPayCard";

interface CyclePaymentStatusProps {
  chamaId: string;
  frequency: string;
  onPayNow?: () => void;
}

interface PaymentStatus {
  id: string;
  member_code: string;
  full_name: string;
  amount_due: number;
  is_paid: boolean;
  payment_time?: string;
  is_late_payment: boolean;
}

interface CycleInfo {
  id: string;
  beneficiary_name: string;
  beneficiary_code: string;
  is_complete: boolean;
  payout_processed: boolean;
  payout_type?: string;
  end_date: string;
  due_amount: number;
}

interface CycleHistoryItem {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  due_amount: number;
  beneficiary_name: string;
  beneficiary_code: string;
  is_complete: boolean;
  payout_processed: boolean;
  payout_type?: string;
  status: 'paid' | 'late' | 'missed' | 'pending';
  member_payment: {
    amount_due: number;
    amount_paid: number;
    amount_remaining: number;
    fully_paid: boolean;
    is_paid: boolean;
    is_late_payment: boolean;
    paid_at?: string;
  } | null;
}

export function CyclePaymentStatus({ chamaId, frequency, onPayNow }: CyclePaymentStatusProps) {
  const [loading, setLoading] = useState(true);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [payments, setPayments] = useState<PaymentStatus[]>([]);
  const [currentUserPaid, setCurrentUserPaid] = useState(false);
  const [cycleHistory, setCycleHistory] = useState<CycleHistoryItem[]>([]);
  const [missedCyclesCount, setMissedCyclesCount] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [cutoffPassed, setCutoffPassed] = useState(false);
  const loadPaymentStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Load current cycle
      const { data, error } = await supabase.functions.invoke('daily-cycle-manager', {
        body: { action: 'current', chamaId }
      });

      if (error) throw error;

      if (data?.cycle) {
        setCycleInfo({
          id: data.cycle.id,
          beneficiary_name: data.cycle.beneficiary?.profiles?.full_name || 'Unknown',
          beneficiary_code: data.cycle.beneficiary?.member_code || '',
          is_complete: data.cycle.is_complete,
          payout_processed: data.cycle.payout_processed,
          payout_type: data.cycle.payout_type,
          end_date: data.cycle.end_date,
          due_amount: data.cycle.due_amount
        });

        // Check if cutoff has passed
        const endDate = new Date(data.cycle.end_date);
        const cutoff = new Date(endDate);
        cutoff.setHours(20, 0, 0, 0);
        setCutoffPassed(new Date() > cutoff);

        const paymentData = data.payments?.map((p: any) => ({
          id: p.id,
          member_code: p.chama_members?.member_code || '',
          full_name: p.chama_members?.profiles?.full_name || 'Unknown',
          amount_due: p.amount_due,
          is_paid: p.is_paid,
          payment_time: p.payment_time,
          is_late_payment: p.is_late_payment,
          user_id: p.chama_members?.user_id
        })) || [];

        setPayments(paymentData);
        
        if (session?.user?.id) {
          const userPayment = paymentData.find((p: any) => p.user_id === session.user.id);
          setCurrentUserPaid(userPayment?.is_paid || false);
        }
      }

      // Load ALL cycles with per-cycle payment history
      if (session?.user?.id) {
        const { data: historyData, error: historyError } = await supabase.functions.invoke('daily-cycle-manager', {
          body: { action: 'all-cycles', chamaId, userId: session.user.id }
        });

        if (!historyError && historyData?.cycles) {
          setCycleHistory(historyData.cycles);
          
          const missed = historyData.cycles.filter((c: CycleHistoryItem) => c.status === 'missed');
          setMissedCyclesCount(missed.length);
          
          const outstanding = missed.reduce((sum: number, c: CycleHistoryItem) => {
            return sum + (c.member_payment?.amount_remaining || c.due_amount);
          }, 0);
          setTotalOutstanding(outstanding);
        }
      }
    } catch (error: any) {
      console.error('Error loading payment status:', error);
      toast.error('Failed to load payment status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentStatus();

    const channel = supabase
      .channel('payment-status-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'member_cycle_payments'
      }, () => {
        loadPaymentStatus();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chamaId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!cycleInfo) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No active payment cycle
        </CardContent>
      </Card>
    );
  }

  const paidCount = payments.filter(p => p.is_paid && !p.is_late_payment).length;
  const totalCount = payments.length;
  const allPaid = paidCount === totalCount;

  return (
    <div className="space-y-4">
      {/* Outstanding Missed Cycles Alert */}
      {missedCyclesCount > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="bg-destructive p-2 rounded-full">
                <XCircle className="h-5 w-5 text-destructive-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-destructive">
                  {missedCyclesCount} Missed Cycle{missedCyclesCount > 1 ? 's' : ''} - KES {totalOutstanding.toLocaleString()} Outstanding
                </p>
                <p className="text-sm text-muted-foreground">
                  You have unpaid cycles. Your next payment will clear the oldest missed cycle first.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Amount to Pay Card - Always visible before payment */}
      {!currentUserPaid && (
        <AmountToPayCard
          contributionAmount={cycleInfo.due_amount}
          missedCycles={missedCyclesCount}
          currentCycleDue={!cutoffPassed}
        />
      )}

      {/* Prominent Countdown Timer */}
      <PaymentCountdownTimer
        endDate={cycleInfo.end_date}
        cutoffHour={20}
        contributionAmount={cycleInfo.due_amount}
        beneficiaryName={cycleInfo.beneficiary_name}
        paidCount={paidCount}
        totalCount={totalCount}
        isPaid={currentUserPaid}
        onPayNow={onPayNow}
      />

      {/* Per-Cycle Payment History */}
      {cycleHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Payment History (Per Cycle)</CardTitle>
            <CardDescription>
              Each cycle is tracked independently. Missed cycles must be cleared individually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cycleHistory.slice(0, 10).map((cycle) => (
                <div
                  key={cycle.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    cycle.status === 'paid' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                    cycle.status === 'missed' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' :
                    cycle.status === 'late' ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800' :
                    'border-border'
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">
                      Cycle #{cycle.cycle_number}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(cycle.start_date), 'MMM d')} - {format(new Date(cycle.end_date), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Beneficiary: {cycle.beneficiary_name}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-medium">
                      KES {cycle.due_amount.toLocaleString()}
                    </span>
                    {cycle.status === 'missed' && (
                      <span className="text-xs text-destructive font-medium">
                        +{((cycle as any).commission_rate * 100 || 10)}% late fee
                      </span>
                    )}
                    {cycle.status === 'paid' ? (
                      <Badge variant="default" className="gap-1 bg-green-600 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        Paid
                      </Badge>
                    ) : cycle.status === 'late' ? (
                      <Badge variant="outline" className="gap-1 text-xs border-yellow-500 text-yellow-700">
                        <AlertCircle className="h-3 w-3" />
                        Late
                      </Badge>
                    ) : cycle.status === 'missed' ? (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <XCircle className="h-3 w-3" />
                        Missed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        Pending
                      </Badge>
                    )}
                    {cycle.member_payment && !cycle.member_payment.fully_paid && cycle.member_payment.amount_paid > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Paid: KES {cycle.member_payment.amount_paid.toLocaleString()} / {cycle.member_payment.amount_due.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Payment Status Card - Current Cycle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {frequency === 'daily' ? "Today's" : "Current Cycle"} Payment Status
              </CardTitle>
              <CardDescription>
                Beneficiary: <span className="font-medium text-foreground">{cycleInfo.beneficiary_name}</span> ({cycleInfo.beneficiary_code})
              </CardDescription>
            </div>
            <div className="text-sm font-medium">
              {paidCount}/{totalCount} paid
            </div>
          </div>
        </CardHeader>
      <CardContent>
        {cycleInfo.payout_processed && (
          <div className="mb-4 p-3 rounded-lg bg-muted border">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">
                {cycleInfo.payout_type === 'full' ? 'Full payout processed' : 'Partial payout processed'}
              </span>
            </div>
          </div>
        )}

        {allPaid && !cycleInfo.payout_processed && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">All members paid! Processing payout...</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  payment.is_paid 
                    ? payment.is_late_payment 
                      ? 'bg-yellow-500' 
                      : 'bg-green-500'
                    : 'bg-red-500'
                }`} />
                <div>
                  <div className="font-medium">{payment.full_name}</div>
                  <div className="text-xs text-muted-foreground">{payment.member_code}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  KES {payment.amount_due.toFixed(2)}
                </span>
                {payment.is_paid ? (
                  payment.is_late_payment ? (
                    <Badge variant="outline" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Late
                    </Badge>
                  ) : (
                    <Badge variant="default" className="gap-1 bg-green-500">
                      <CheckCircle2 className="h-3 w-3" />
                      Paid
                      {payment.payment_time && (
                        <span className="ml-1 text-xs">
                          {format(new Date(payment.payment_time), 'HH:mm')}
                        </span>
                      )}
                    </Badge>
                  )
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    Unpaid
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
          <p>
            • Each cycle is tracked independently - payment status is per cycle, not cumulative
          </p>
          <p className="mt-1">
            • Late payments (after 8:00 PM on due date) clear the oldest missed cycle first
          </p>
          <p className="mt-1">
            • Overpayments are credited as carry-forward for the next cycle
          </p>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
