import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, AlertCircle, Clock, TrendingUp, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PaymentCountdownTimer } from "./PaymentCountdownTimer";


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
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const loadPaymentStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Auto-advance expired cycles before loading current
      try {
        await supabase.functions.invoke('daily-cycle-manager', {
          body: { action: 'auto-advance', chamaId }
        });
      } catch (advanceErr) {
        console.log('Auto-advance check:', advanceErr);
      }

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

        // Check if cutoff has passed (10:00 PM deadline)
        const endDate = new Date(data.cycle.end_date);
        const cutoff = new Date(endDate);
        cutoff.setHours(22, 0, 0, 0);
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

          // Fetch current user's chama member ID
          const { data: memberData } = await supabase
            .from('chama_members')
            .select('id')
            .eq('chama_id', chamaId)
            .eq('user_id', session.user.id)
            .eq('approval_status', 'approved')
            .maybeSingle();
          if (memberData) setCurrentMemberId(memberData.id);
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

  const paidCount = payments.filter(p => p.is_paid).length;
  const paidOnTimeCount = payments.filter(p => p.is_paid && !p.is_late_payment).length;
  const paidLateCount = payments.filter(p => p.is_paid && p.is_late_payment).length;
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

      {/* Prominent Countdown Timer */}
      <PaymentCountdownTimer
        endDate={cycleInfo.end_date}
        cutoffHour={22}
        contributionAmount={cycleInfo.due_amount}
        totalPayable={totalOutstanding > 0 ? totalOutstanding * 1.05 : cycleInfo.due_amount * 1.05}
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
                      {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
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

      {/* Financial Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Cycle Financial Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Expected</p>
              <p className="text-lg font-bold text-foreground">
                KES {(totalCount * (cycleInfo?.due_amount || 0)).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{totalCount} × KES {(cycleInfo?.due_amount || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-lg font-bold text-foreground">
                KES {payments.filter(p => p.is_paid).reduce((s, p) => s + p.amount_due, 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{paidCount}/{totalCount} paid</p>
            </div>
            <div className={`rounded-lg border p-3 text-center ${paidLateCount > 0 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted/40'}`}>
              <p className="text-xs text-muted-foreground">Late Penalties (10%)</p>
              <p className={`text-lg font-bold ${paidLateCount > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground'}`}>
                KES {(paidLateCount * (cycleInfo?.due_amount || 0) * 0.10).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{paidLateCount} late payment{paidLateCount !== 1 ? 's' : ''}</p>
            </div>
            <div className={`rounded-lg border p-3 text-center ${payments.filter(p => !p.is_paid).length > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}`}>
              <p className="text-xs text-muted-foreground">Unpaid Members</p>
              <p className={`text-lg font-bold ${payments.filter(p => !p.is_paid).length > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {payments.filter(p => !p.is_paid).length}
              </p>
              <p className="text-xs text-muted-foreground">
                KES {(payments.filter(p => !p.is_paid).length * (cycleInfo?.due_amount || 0)).toLocaleString()} missing
              </p>
            </div>
          </div>
          {payments.filter(p => !p.is_paid).length > 0 && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Unpaid Members</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {payments.filter(p => !p.is_paid).map(p => (
                  <Badge key={p.id} variant="destructive" className="text-xs">
                    {p.full_name}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ Payout at 10:00 PM will include only collected amounts. Overpayments from other members do NOT cover unpaid obligations.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
                          {formatDateTime(payment.payment_time).split(' ')[1]}
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
            • Late payments (after 10:00 PM) apply to this cycle with a 10% penalty — no carry-forward
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
