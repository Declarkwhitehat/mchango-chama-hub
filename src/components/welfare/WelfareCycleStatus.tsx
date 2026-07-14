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
  const [allCycles, setAllCycles] = useState<any[]>([]);
  const [allContributions, setAllContributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCycleData();
  }, [welfareId]);

  const fetchCycleData = async () => {
    try {
      // All cycles ever (active + completed) — needed for cumulative required calc
      const { data: cycles } = await supabase
        .from('welfare_contribution_cycles')
        .select('*')
        .eq('welfare_id', welfareId)
        .in('status', ['active', 'completed'])
        .order('start_date', { ascending: true });

      const cyclesList = cycles || [];
      setAllCycles(cyclesList);

      const active = cyclesList.find((c: any) => c.status === 'active') || null;
      setActiveCycle(active);

      // All completed contributions for this welfare across ALL time
      const { data: contribs } = await supabase
        .from('welfare_contributions')
        .select('member_id, user_id, net_amount, gross_amount, payment_status, created_at')
        .eq('welfare_id', welfareId)
        .eq('payment_status', 'completed');

      setAllContributions(contribs || []);
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

  // --- Cumulative credit computation per member ---
  // required = sum of cycle.amount for every cycle that started at/after the member joined
  // paid     = sum of gross_amount of that member's completed contributions
  // credit   = paid - required (positive = surplus carried forward)

  const contributionsByMember = new Map<string, number>();
  const contributionsByUser = new Map<string, number>();
  allContributions.forEach((c: any) => {
    const amt = Number(c.gross_amount || c.net_amount || 0);
    if (c.member_id) {
      contributionsByMember.set(c.member_id, (contributionsByMember.get(c.member_id) || 0) + amt);
    }
    if (c.user_id) {
      contributionsByUser.set(c.user_id, (contributionsByUser.get(c.user_id) || 0) + amt);
    }
  });

  const computeRequired = (memberJoinedAt: string | null) => {
    if (!memberJoinedAt) {
      return allCycles.reduce((s, c) => s + Number(c.amount || 0), 0);
    }
    const joined = parseISO(memberJoinedAt);
    return allCycles
      .filter((c: any) => {
        const cycleStart = parseISO(c.start_date);
        // Bill member for a cycle if they joined on/before that cycle started
        return joined <= cycleStart || c.status === 'active';
      })
      .reduce((s, c) => {
        // If they joined AFTER an active cycle started, still bill the active cycle
        // (they can pay for the current one). But skip past cycles that started before they joined.
        const cycleStart = parseISO(c.start_date);
        if (joined > cycleStart && c.status !== 'active') return s;
        return s + Number(c.amount || 0);
      }, 0);
  };

  type Row = {
    member: any;
    paid: number;
    required: number;
    credit: number; // paid - required
  };

  const rows: Row[] = members.map((m: any) => {
    const paidByMember = contributionsByMember.get(m.id) || 0;
    const paidByUser = m.user_id ? (contributionsByUser.get(m.user_id) || 0) : 0;
    // Prefer member-id linkage; fall back to user-id when member_id wasn't set on the row
    const paid = Math.max(paidByMember, paidByUser);
    const required = computeRequired(m.joined_at || m.created_at || null);
    return { member: m, paid, required, credit: paid - required };
  });

  const cycleAmount = Number(activeCycle.amount || 0);

  const paidRows = rows.filter(r => r.credit >= 0);
  const underpaidRows = rows.filter(r => r.credit < 0 && r.credit > -cycleAmount);
  const unpaidRows = rows.filter(r => r.credit <= -cycleAmount);

  const currentUserRow = rows.find(r => r.member.user_id === user?.id);
  const currentUserPaid = currentUserRow ? currentUserRow.credit >= 0 : false;
  const currentUserCredit = currentUserRow?.credit ?? 0;
  const currentUserOwes = !currentUserPaid;

  return (
    <div className="space-y-3">
      {currentUserOwes && !isExpired && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payment Required</AlertTitle>
          <AlertDescription>
            {currentUserCredit > -cycleAmount
              ? `You still owe KES ${Math.abs(currentUserCredit).toLocaleString()} to complete this cycle.`
              : `You owe KES ${Math.abs(currentUserCredit).toLocaleString()} in total (this and past cycles).`
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
            The deadline has passed! You owe KES {Math.abs(currentUserCredit).toLocaleString()}. Please pay immediately.
          </AlertDescription>
        </Alert>
      )}

      {currentUserPaid && currentUserCredit > 0 && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>You're covered</AlertTitle>
          <AlertDescription>
            You have a credit of KES {currentUserCredit.toLocaleString()} from previous overpayment
            {currentUserCredit >= cycleAmount ? " — this cycle is fully covered." : "."}
          </AlertDescription>
        </Alert>
      )}

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
              <p className="text-lg font-bold text-primary">KES {cycleAmount.toLocaleString()}</p>
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

          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {paidRows.length}/{members.length} paid
            </span>
            {paidRows.length === members.length ? (
              <Badge className="bg-green-500 text-white">All Paid</Badge>
            ) : (
              <Badge variant="destructive">{unpaidRows.length + underpaidRows.length} outstanding</Badge>
            )}
          </div>

          {/* Paid members with carried-forward credit */}
          {paidRows.some(r => r.credit > 0) && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium text-green-600">
                  Members with credit ({paidRows.filter(r => r.credit > 0).length})
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-2">
                {paidRows.filter(r => r.credit > 0).map(({ member: m, credit }) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span className="text-sm">{m.profiles?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground font-mono">{m.member_code}</span>
                    </div>
                    <Badge variant="outline" className="text-green-700 border-green-500 text-xs">
                      Credit: KES {credit.toLocaleString()}
                    </Badge>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {unpaidRows.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium text-destructive">Unpaid Members ({unpaidRows.length})</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-2">
                {unpaidRows.map(({ member: m, credit }) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      <span className="text-sm">{m.profiles?.full_name || 'Unknown'}</span>
                      <span className="text-xs text-muted-foreground font-mono">{m.member_code}</span>
                    </div>
                    <Badge variant="outline" className="text-destructive border-destructive text-xs">
                      KES {Math.abs(credit).toLocaleString()} owed
                    </Badge>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {underpaidRows.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium text-orange-600">Underpaid Members ({underpaidRows.length})</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-2">
                {underpaidRows.map(({ member: m, credit }) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                      <span className="text-sm">{m.profiles?.full_name || 'Unknown'}</span>
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">
                      KES {Math.abs(credit).toLocaleString()} remaining
                    </Badge>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
