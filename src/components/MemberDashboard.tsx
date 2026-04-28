import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";
import { CyclePaymentStatus } from "@/components/chama/DailyPaymentStatus";
import { CheckCircle2, TrendingUp, CreditCard, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getNextDay10PmKenyaDeadline } from "@/utils/chamaDeadlines";
import { toast } from "@/hooks/use-toast";
// realtime subscription removed in favor of 30s polling

interface MemberDashboardProps {
  chamaId: string;
  onPayNow?: () => void;
}

export const MemberDashboard = ({ chamaId, onPayNow }: MemberDashboardProps) => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) loadDashboard(true);
    });

    // Poll contributions every 30s instead of realtime subscription
    const interval = setInterval(() => loadDashboard(true), 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [chamaId]);

  const loadDashboard = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsLoading(false); return; }

      const { data, error } = await supabase.functions.invoke('member-dashboard', {
        body: { chama_id: chamaId }
      });

      if (error) {
        if (error.message?.includes('Pending approval')) {
          toast({ title: "Pending Approval", description: "Your membership is awaiting manager approval." });
        } else if (error.message?.includes('Not a member')) {
          toast({ title: "Not a Member", description: "You need to join this chama to view the dashboard", variant: "destructive" });
        } else {
          toast({ title: "Error Loading Dashboard", description: error.message || "Failed to load dashboard data", variant: "destructive" });
        }
        setDashboardData(null);
      } else {
        setDashboardData(data?.data || data);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load dashboard", variant: "destructive" });
      setDashboardData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading dashboard...</p>
        </CardContent>
      </Card>
    );
  }

  if (!dashboardData) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          <p className="text-center text-lg font-semibold">Welcome to Your Dashboard</p>
          <p className="text-center text-muted-foreground">
            Start making contributions to see your dashboard data and payment history.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Handle removed member state
  if (dashboardData?.is_removed) {
    const removedMember = dashboardData.member;
    const removedChama = dashboardData.chama;
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="bg-destructive/10 p-3 rounded-full">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <p className="text-xl font-bold text-destructive">Membership Ended</p>
              <p className="text-muted-foreground mt-1">
                You are no longer a member of <strong>{removedChama?.name}</strong>
              </p>
            </div>
          </div>
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Reason</span>
              <span className="font-medium">{removedMember?.removal_reason}</span>
            </div>
            {removedMember?.removed_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(removedMember.removed_at)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { member, chama, current_cycle, payment_history, payout_schedule } = dashboardData;
  const netBalance = member.balance_credit - member.balance_deficit;
  const missedCount = member.missed_payments_count || 0;
  const totalOutstanding = member.total_outstanding || 0;
  const isCycleComplete = chama.status === 'cycle_complete';

  const graceDeadline = chama.status === 'active'
    ? getNextDay10PmKenyaDeadline(chama.start_date)
    : null;
  const isGracePeriod = !!graceDeadline && Date.now() < graceDeadline.getTime();

  return (
    <div className="space-y-4">
      {/* Missed Payments Warning — suppressed during grace period */}
      {!isGracePeriod && !isCycleComplete && missedCount >= 2 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="bg-destructive p-2 rounded-full shrink-0">
                <AlertCircle className="h-5 w-5 text-destructive-foreground" />
              </div>
              <div>
                <p className="font-bold text-destructive text-lg">
                  ⚠️ {missedCount} Consecutive Missed Payments!
                </p>
                <p className="text-sm text-destructive mt-1">
                  {missedCount >= 3
                    ? "You have been removed from this group due to 3 consecutive missed payments."
                    : `You will be REMOVED if you miss 1 more payment! Clear KES ${totalOutstanding.toLocaleString()} immediately.`
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isGracePeriod && !isCycleComplete && missedCount === 1 && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-700 dark:text-yellow-400">1 Missed Payment</p>
                <p className="text-sm text-muted-foreground">
                  Outstanding: KES {totalOutstanding.toLocaleString()}. Pay now to avoid further penalties.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cycle Complete Info */}
      {isCycleComplete && (
        <Card className="border-primary bg-primary/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-primary">Cycle Complete</p>
                <p className="text-sm text-muted-foreground">
                  A new cycle will start once enough members rejoin.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cycle Payment Status — the consolidated payment view */}
      <CyclePaymentStatus 
        chamaId={chamaId} 
        frequency={chama.contribution_frequency}
        chamaStartDate={chama.start_date}
        onPayNow={onPayNow}
      />

      {/* Member ID */}
      <CopyableUniqueId uniqueId={member.member_code} label="Member ID (Account No.)" />

      {/* Member Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{member.full_name}</CardTitle>
              <CardDescription>
                {member.member_code} • Position #{member.order_index}
              </CardDescription>
            </div>
            {current_cycle?.is_paid && (
              <Badge variant="default" className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Paid This Cycle
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Balance</p>
              <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                KES {netBalance.toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Contribution</p>
              <p className="text-2xl font-bold text-foreground">
                KES {chama.contribution_amount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{chama.contribution_frequency}</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Next Due</p>
              <p className="text-lg font-semibold text-foreground">
                {member.next_due_date ? formatDate(member.next_due_date) : 'TBD'}
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Last Payment</p>
              <p className="text-lg font-semibold text-foreground">
                {member.last_payment_date ? formatDate(member.last_payment_date) : 'No payments yet'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payout Schedule */}
      {payout_schedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Your Payout Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Position in Queue</p>
                <p className="text-3xl font-bold text-primary">#{payout_schedule.position_in_queue}</p>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Estimated Payout Date</p>
                <p className="text-lg font-semibold text-foreground">{formatDate(payout_schedule.estimated_payout_date)}</p>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Estimated Amount</p>
                <p className="text-2xl font-bold text-primary">KES {payout_schedule.estimated_amount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payment_history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No payments yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment_history.map((payment: any) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.contribution_date)}</TableCell>
                    <TableCell className="font-medium">KES {payment.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
