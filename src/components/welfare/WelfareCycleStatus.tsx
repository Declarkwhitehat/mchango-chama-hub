import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Clock, CheckCircle, Users, ChevronDown } from "lucide-react";
import { differenceInDays, differenceInHours, format, parseISO } from "date-fns";

interface Props {
  welfareId: string;
  members: any[];
}

export const WelfareCycleStatus = ({ welfareId, members }: Props) => {
  const { user } = useAuth();
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [contributions, setContributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCycleData();
  }, [welfareId]);

  const fetchCycleData = async () => {
    try {
      // Fetch active cycle
      const { data: cycles } = await supabase
        .from('welfare_contribution_cycles')
        .select('*')
        .eq('welfare_id', welfareId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      const cycle = cycles?.[0];
      setActiveCycle(cycle || null);

      if (cycle) {
        // Fetch contributions for this cycle period
        const { data: contribs } = await supabase
          .from('welfare_contributions')
          .select('member_id, user_id, net_amount, gross_amount, payment_status, created_at')
          .eq('welfare_id', welfareId)
          .gte('created_at', cycle.start_date)
          .lte('created_at', cycle.end_date)
          .eq('payment_status', 'completed');

        setContributions(contribs || []);
      }
    } catch (error) {
      console.error('Error fetching cycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !activeCycle) return null;

  const endDate = parseISO(activeCycle.end_date);
  const now = new Date();
  const daysLeft = differenceInDays(endDate, now);
  const hoursLeft = differenceInHours(endDate, now);
  const isExpired = now > endDate;

  // Determine who has paid
  const paidMemberIds = new Set(contributions.map((c: any) => c.member_id));
  const paidUserIds = new Set(contributions.map((c: any) => c.user_id));

  // Get total paid per member
  const memberPayments = new Map<string, number>();
  contributions.forEach((c: any) => {
    const key = c.member_id;
    memberPayments.set(key, (memberPayments.get(key) || 0) + (c.net_amount || c.gross_amount || 0));
  });

  const unpaidMembers = members.filter((m: any) =>
    !paidMemberIds.has(m.id) && !paidUserIds.has(m.user_id)
  );

  const underpaidMembers = members.filter((m: any) => {
    const paid = memberPayments.get(m.id) || 0;
    return paid > 0 && paid < activeCycle.amount;
  });

  const currentUserPaid = paidUserIds.has(user?.id);
  const currentUserUnderpaid = (() => {
    const myMember = members.find((m: any) => m.user_id === user?.id);
    if (!myMember) return false;
    const paid = memberPayments.get(myMember.id) || 0;
    return paid > 0 && paid < activeCycle.amount;
  })();
  const currentUserOwes = !currentUserPaid || currentUserUnderpaid;

  return (
    <div className="space-y-3">
      {/* Banner for unpaid current user */}
      {currentUserOwes && !isExpired && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payment Required</AlertTitle>
          <AlertDescription>
            {currentUserUnderpaid
              ? `You have underpaid. Required: KES ${activeCycle.amount.toLocaleString()}. Please pay the remaining balance.`
              : `You have not paid the required KES ${activeCycle.amount.toLocaleString()} for this cycle.`
            }
            {daysLeft > 0
              ? ` Deadline: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left.`
              : hoursLeft > 0
              ? ` Deadline: ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} left.`
              : ' Deadline is today!'
            }
          </AlertDescription>
        </Alert>
      )}

      {currentUserOwes && isExpired && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Overdue Payment</AlertTitle>
          <AlertDescription>
            The deadline has passed! You still owe KES {activeCycle.amount.toLocaleString()}. Please pay immediately.
          </AlertDescription>
        </Alert>
      )}

      {/* Active Cycle Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Active Contribution Cycle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Required Amount</p>
              <p className="text-lg font-bold text-primary">KES {activeCycle.amount.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Deadline</p>
              <p className="text-lg font-bold">
                {isExpired ? (
                  <span className="text-destructive">Expired</span>
                ) : daysLeft > 0 ? (
                  `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                ) : (
                  <span className="text-orange-500">{hoursLeft}h left</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{format(endDate, 'MMM dd, yyyy')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {members.length - unpaidMembers.length}/{members.length} paid
            </span>
            {unpaidMembers.length === 0 ? (
              <Badge className="bg-green-500 text-white">All Paid</Badge>
            ) : (
              <Badge variant="destructive">{unpaidMembers.length} unpaid</Badge>
            )}
          </div>

          {/* Unpaid members list */}
          {unpaidMembers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">Unpaid Members:</p>
              <div className="space-y-1">
                {unpaidMembers.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      <span className="text-sm">{m.profiles?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground font-mono">{m.member_code}</span>
                    </div>
                    <Badge variant="outline" className="text-destructive border-destructive text-xs">
                      KES {activeCycle.amount.toLocaleString()} owed
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Underpaid members */}
          {underpaidMembers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-orange-600">Underpaid Members:</p>
              <div className="space-y-1">
                {underpaidMembers.map((m: any) => {
                  const paid = memberPayments.get(m.id) || 0;
                  const remaining = activeCycle.amount - paid;
                  return (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        <span className="text-sm">{m.profiles?.full_name || 'Unknown'}</span>
                      </div>
                      <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">
                        KES {remaining.toLocaleString()} remaining
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
