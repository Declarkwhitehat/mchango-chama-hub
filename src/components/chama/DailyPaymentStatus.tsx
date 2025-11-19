import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface DailyPaymentStatusProps {
  chamaId: string;
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
}

export function DailyPaymentStatus({ chamaId }: DailyPaymentStatusProps) {
  const [loading, setLoading] = useState(true);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [payments, setPayments] = useState<PaymentStatus[]>([]);
  const [timeUntilCutoff, setTimeUntilCutoff] = useState<string>("");

  const loadPaymentStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('daily-cycle-manager/current/' + chamaId);

      if (error) throw error;

      if (data?.cycle) {
        setCycleInfo({
          id: data.cycle.id,
          beneficiary_name: data.cycle.beneficiary?.profiles?.full_name || 'Unknown',
          beneficiary_code: data.cycle.beneficiary?.member_code || '',
          is_complete: data.cycle.is_complete,
          payout_processed: data.cycle.payout_processed,
          payout_type: data.cycle.payout_type
        });

        const paymentData = data.payments?.map((p: any) => ({
          id: p.id,
          member_code: p.chama_members?.member_code || '',
          full_name: p.chama_members?.profiles?.full_name || 'Unknown',
          amount_due: p.amount_due,
          is_paid: p.is_paid,
          payment_time: p.payment_time,
          is_late_payment: p.is_late_payment
        })) || [];

        setPayments(paymentData);
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

    // Set up real-time subscription
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

  // Calculate time until 8 PM cutoff
  useEffect(() => {
    const updateCutoffTime = () => {
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(20, 0, 0, 0); // 8:00 PM

      if (now > cutoff) {
        setTimeUntilCutoff("Cutoff passed");
      } else {
        const diff = cutoff.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeUntilCutoff(`${hours}h ${minutes}m until cutoff`);
      }
    };

    updateCutoffTime();
    const interval = setInterval(updateCutoffTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

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
          No active payment cycle for today
        </CardContent>
      </Card>
    );
  }

  const paidCount = payments.filter(p => p.is_paid && !p.is_late_payment).length;
  const totalCount = payments.length;
  const allPaid = paidCount === totalCount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Today's Payment Status</CardTitle>
            <CardDescription>
              Today's beneficiary: <span className="font-medium text-foreground">{cycleInfo.beneficiary_name}</span> ({cycleInfo.beneficiary_code})
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {timeUntilCutoff}
            </div>
            <div className="text-sm font-medium mt-1">
              {paidCount}/{totalCount} paid
            </div>
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
            • Payments made before 8:00 PM count towards today's payout
          </p>
          <p className="mt-1">
            • Late payments (after 8:00 PM) are credited to next cycle
          </p>
          <p className="mt-1">
            • Full payout if all members pay, partial payout at 8:00 PM otherwise
          </p>
        </div>
      </CardContent>
    </Card>
  );
}