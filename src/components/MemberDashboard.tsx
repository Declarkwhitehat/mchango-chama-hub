import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";
import { CyclePaymentStatus } from "@/components/chama/DailyPaymentStatus";
import { CheckCircle2, TrendingUp, Calendar, CreditCard, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MemberDashboardProps {
  chamaId: string;
  onPayNow?: () => void;
}

export const MemberDashboard = ({ chamaId, onPayNow }: MemberDashboardProps) => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboard();

    // Listen for auth state changes to avoid race conditions where the function is called before session is ready
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadDashboard();
      }
    });

    // Set up realtime subscription for contributions
    const channel: RealtimeChannel = supabase
      .channel('contributions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contributions',
          filter: `chama_id=eq.${chamaId}`
        },
        () => {
          console.log('Contribution changed, reloading dashboard...');
          loadDashboard();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [chamaId]);

  const loadDashboard = async () => {
    try {
      console.log('MemberDashboard: Starting to load dashboard for chama:', chamaId);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log("MemberDashboard: No session found");
        setIsLoading(false);
        return;
      }

      console.log('MemberDashboard: Session found, invoking member-dashboard function');

      const { data, error } = await supabase.functions.invoke('member-dashboard', {
        body: { chama_id: chamaId }
      });

      console.log('MemberDashboard: Function response:', { data, error });

      if (error) {
        console.error("MemberDashboard: Dashboard error:", error);
        
        // Handle specific error cases
        if (error.message?.includes('Pending approval')) {
          toast({
            title: "Pending Approval",
            description: "Your membership is awaiting manager approval. You'll be able to access the dashboard once approved.",
            variant: "default"
          });
        } else if (error.message?.includes('Not a member')) {
          toast({
            title: "Not a Member",
            description: "You need to join this chama to view the dashboard",
            variant: "destructive"
          });
        } else if (error.message?.includes('AUTH') || error.message?.includes('Unauthorized')) {
          toast({
            title: "Authentication Required",
            description: "Please log in to view your dashboard",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error Loading Dashboard",
            description: error.message || "Failed to load dashboard data",
            variant: "destructive"
          });
        }
        setDashboardData(null);
      } else {
        console.log('MemberDashboard: Successfully loaded dashboard data');
        setDashboardData(data?.data || data);
      }
    } catch (error: any) {
      console.error("MemberDashboard: Error loading dashboard:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load dashboard",
        variant: "destructive"
      });
      setDashboardData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Loading dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-center text-lg font-semibold">Welcome to Your Dashboard</p>
            <p className="text-center text-muted-foreground">
              Start making contributions to see your dashboard data and payment history.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle removed member state
  if (dashboardData?.is_removed) {
    const removedMember = dashboardData.member;
    const removedChama = dashboardData.chama;
    return (
      <div className="space-y-4">
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
                  <span className="font-medium">
                    {new Date(removedMember.removed_at).toLocaleDateString('en-US', { 
                      month: 'short', day: 'numeric', year: 'numeric' 
                    })}
                  </span>
                </div>
              )}
              {removedMember?.member_code && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Former Member ID</span>
                  <code className="text-xs">{removedMember.member_code}</code>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              If you believe this was an error, please contact the chama manager or support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { member, chama, current_cycle, payment_history, payout_schedule, missed_payments } = dashboardData;
  const netBalance = member.balance_credit - member.balance_deficit;
  const missedCount = member.missed_payments_count || 0;
  const totalOutstanding = member.total_outstanding || 0;
  const isCycleComplete = chama.status === 'cycle_complete';
  
  // Calculate total pool for commission display
  const totalContributions = payment_history.reduce((sum: number, payment: any) => 
    sum + (payment.status === 'completed' ? payment.amount : 0), 0
  );

  return (
    <div className="space-y-6">
      {/* Missed Payments Warning Banner - Only show removal warnings when chama is active */}
      {!isCycleComplete && missedCount >= 2 && (
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
                    : `You will be REMOVED from the group if you miss 1 more payment! Clear your outstanding balance of KES ${totalOutstanding.toLocaleString()} immediately.`
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isCycleComplete && missedCount === 1 && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-700 dark:text-yellow-400">
                  1 Missed Payment
                </p>
                <p className="text-sm text-muted-foreground">
                  Outstanding: KES {totalOutstanding.toLocaleString()}. Pay now to avoid further penalties.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cycle Complete Info Banner */}
      {isCycleComplete && (
        <Card className="border-primary bg-primary/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-primary">
                  Cycle Complete
                </p>
                <p className="text-sm text-muted-foreground">
                  This chama's cycle has been completed. A new cycle will start automatically once enough members rejoin.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding Balance Card - Always visible if there's money owed */}
      {totalOutstanding > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <CreditCard className="h-5 w-5" />
              {isCycleComplete ? 'Historical Outstanding Balance' : 'Outstanding Balance'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-destructive/10 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Total Amount Due</p>
                <p className="text-3xl font-bold text-destructive">
                  KES {totalOutstanding.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isCycleComplete 
                    ? `From ${missedCount} missed payment${missedCount !== 1 ? 's' : ''} in previous cycle`
                    : `From ${missedCount} missed payment${missedCount !== 1 ? 's' : ''}`
                  }
                </p>
              </div>
              {!isCycleComplete && onPayNow && (
                <Button variant="destructive" onClick={onPayNow}>
                  Pay Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missed Payments Breakdown */}
      {missed_payments && missed_payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {isCycleComplete ? 'Previous Cycle Missed Payments' : 'Missed Payments Record'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missed_payments.map((mp: any, idx: number) => (
                  <TableRow key={idx} className="bg-destructive/5">
                    <TableCell className="font-medium">#{mp.cycle_number}</TableCell>
                    <TableCell className="text-sm">
                      {mp.start_date ? new Date(mp.start_date).toLocaleDateString() : '-'} – {mp.end_date ? new Date(mp.end_date).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>KES {(mp.amount_due || 0).toLocaleString()}</TableCell>
                    <TableCell>KES {(mp.amount_paid || 0).toLocaleString()}</TableCell>
                    <TableCell className="font-bold text-destructive">
                      KES {(mp.amount_remaining || 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cycle Payment Status - For all contribution frequencies */}
      <CyclePaymentStatus 
        chamaId={chamaId} 
        frequency={chama.contribution_frequency} 
        onPayNow={onPayNow}
      />

      {/* Member ID - Offline Payment Instructions */}
      <CopyableUniqueId uniqueId={member.member_code} label="Member ID (Account No.)" />

      {/* Commission Display - Show member's own contribution commission info */}
      <CommissionDisplay
        totalCollected={totalContributions}
        commissionRate={chama.commission_rate || 0.05}
        type="chama"
        showBreakdown={true}
      />

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
              {member.balance_credit > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Credit: KES {member.balance_credit.toLocaleString()}
                </p>
              )}
              {member.balance_deficit > 0 && (
                <p className="text-xs text-destructive mt-1">
                  Deficit: KES {member.balance_deficit.toLocaleString()}
                </p>
              )}
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Contribution</p>
              <p className="text-2xl font-bold text-foreground">
                KES {chama.contribution_amount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">
                {chama.contribution_frequency}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Next Due</p>
              <p className="text-lg font-semibold text-foreground">
                {member.next_due_date 
                  ? new Date(member.next_due_date).toLocaleDateString()
                  : 'TBD'}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Last Payment</p>
              <p className="text-lg font-semibold text-foreground">
                {member.last_payment_date
                  ? new Date(member.last_payment_date).toLocaleDateString()
                  : 'No payments yet'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payout Schedule Card */}
      {payout_schedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Your Payout Schedule
            </CardTitle>
            <CardDescription>When you'll receive your payout</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Position in Queue</p>
                <p className="text-3xl font-bold text-primary">
                  #{payout_schedule.position_in_queue}
                </p>
              </div>

              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Estimated Payout Date</p>
                <p className="text-lg font-semibold text-foreground">
                  {new Date(payout_schedule.estimated_payout_date).toLocaleDateString()}
                </p>
              </div>

              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Estimated Amount</p>
                <p className="text-2xl font-bold text-primary">
                  KES {payout_schedule.estimated_amount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment History
          </CardTitle>
          <CardDescription>Your contribution records</CardDescription>
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
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment_history.map((payment: any) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div>
                        <p>{new Date(payment.contribution_date).toLocaleDateString()}</p>
                        {payment.payment_notes && (
                          <p className="text-xs text-muted-foreground mt-1">{payment.payment_notes}</p>
                        )}
                      </div>
                    </TableCell>
                   <TableCell className="font-medium">
                     <div>
                       <p>KES {payment.amount.toLocaleString()}</p>
                       {payment.paid_by_member_id !== payment.member_id && (
                         <p className="text-xs text-muted-foreground mt-1">
                           Paid by another member
                         </p>
                       )}
                     </div>
                   </TableCell>
                   <TableCell className="text-muted-foreground">
                     {payment.payment_reference}
                   </TableCell>
                   <TableCell>
                     <div className="space-y-1">
                       <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                         {payment.status}
                       </Badge>
                       {payment.status === 'completed' && (
                         <p className="text-xs text-muted-foreground">
                           Net: KES {(payment.amount * (1 - (chama.commission_rate || 0.05))).toLocaleString()}
                         </p>
                       )}
                     </div>
                   </TableCell>
                   </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Balance Info */}
      {(member.balance_credit > 0 || member.balance_deficit > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Balance Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {member.balance_credit > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-900">
                  You have a credit of KES {member.balance_credit.toLocaleString()}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  This will be applied to your next contribution
                </p>
              </div>
            )}
            {member.balance_deficit > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-900">
                  You have a deficit of KES {member.balance_deficit.toLocaleString()}
                </p>
                <p className="text-xs text-red-700 mt-1">
                  Please make a payment to clear your deficit
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};