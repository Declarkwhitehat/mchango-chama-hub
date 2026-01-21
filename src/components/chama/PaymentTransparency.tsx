import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, AlertTriangle, Users, Loader2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface MemberContributionStatus {
  id: string;
  memberCode: string;
  name: string;
  orderIndex: number;
  requiredAmount: number;
  contributedAmount: number;
  shortfall: number;
  isEligible: boolean;
  contributionStatus: string;
  wasSkipped: boolean;
  skipReason?: string;
}

interface PaymentTransparencyProps {
  chamaId: string;
  contributionAmount: number;
}

export const PaymentTransparency = ({ chamaId, contributionAmount }: PaymentTransparencyProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberContributionStatus[]>([]);

  useEffect(() => {
    loadMemberStatuses();
  }, [chamaId]);

  const loadMemberStatuses = async () => {
    try {
      // Get all approved active members
      const { data: membersData, error: membersError } = await supabase
        .from('chama_members')
        .select(`
          id,
          member_code,
          order_index,
          total_contributed,
          expected_contributions,
          contribution_status,
          was_skipped,
          skip_reason,
          profiles!chama_members_user_id_fkey(full_name)
        `)
        .eq('chama_id', chamaId)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .order('order_index', { ascending: true });

      if (membersError) throw membersError;

      // Get contributions for each member to calculate actual totals
      const memberStatuses: MemberContributionStatus[] = [];

      for (const member of membersData || []) {
        const { data: contributions } = await supabase
          .from('contributions')
          .select('amount')
          .eq('member_id', member.id)
          .eq('status', 'completed');

        const contributedAmount = contributions?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
        const requiredAmount = contributionAmount * member.order_index;
        const shortfall = Math.max(requiredAmount - contributedAmount, 0);
        const isEligible = contributedAmount >= requiredAmount;

        memberStatuses.push({
          id: member.id,
          memberCode: member.member_code,
          name: member.profiles?.full_name || 'Unknown',
          orderIndex: member.order_index,
          requiredAmount,
          contributedAmount,
          shortfall,
          isEligible,
          contributionStatus: member.contribution_status || 'incomplete',
          wasSkipped: member.was_skipped || false,
          skipReason: member.skip_reason
        });
      }

      setMembers(memberStatuses);
    } catch (error: any) {
      console.error('Error loading member statuses:', error);
      toast({
        title: "Error",
        description: "Failed to load member contribution statuses",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (member: MemberContributionStatus) => {
    if (member.wasSkipped) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Skipped
        </Badge>
      );
    }
    if (member.isEligible) {
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <CheckCircle className="h-3 w-3" />
          Eligible
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 bg-yellow-600 text-white">
        <AlertTriangle className="h-3 w-3" />
        Incomplete
      </Badge>
    );
  };

  const eligibleCount = members.filter(m => m.isEligible).length;
  const skippedCount = members.filter(m => m.wasSkipped).length;
  const incompleteCount = members.filter(m => !m.isEligible && !m.wasSkipped).length;
  const totalContributed = members.reduce((sum, m) => sum + m.contributedAmount, 0);
  const totalRequired = members.reduce((sum, m) => sum + m.requiredAmount, 0);
  const overallProgress = totalRequired > 0 ? (totalContributed / totalRequired) * 100 : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Payment Transparency
        </CardTitle>
        <CardDescription>
          Real-time view of who has paid and who is eligible for payout
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-green-600">{eligibleCount}</p>
            <p className="text-xs text-muted-foreground">Eligible</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">{incompleteCount}</p>
            <p className="text-xs text-muted-foreground">Incomplete</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-red-600">{skippedCount}</p>
            <p className="text-xs text-muted-foreground">Skipped</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{members.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Collection Progress</span>
            <span className="font-medium">KES {totalContributed.toLocaleString()} / {totalRequired.toLocaleString()}</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{overallProgress.toFixed(1)}% collected</p>
        </div>

        {/* Detailed Member Table */}
        <Accordion type="single" collapsible defaultValue="members">
          <AccordionItem value="members">
            <AccordionTrigger>Member Details</AccordionTrigger>
            <AccordionContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead className="text-right">Required</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Shortfall</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id} className={member.wasSkipped ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <TableCell className="font-medium">{member.orderIndex}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.memberCode}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          KES {member.requiredAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={member.contributedAmount >= member.requiredAmount ? "text-green-600 font-medium" : ""}>
                            KES {member.contributedAmount.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {member.shortfall > 0 ? (
                            <span className="text-red-600 font-medium">
                              KES {member.shortfall.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-green-600">—</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(member)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Skipped Members Alert */}
        {skippedCount > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  {skippedCount} member(s) have been skipped
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  These members missed their payout turn due to incomplete contributions. 
                  They will be rescheduled once they complete their payments.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info Note */}
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
          <p className="font-medium mb-1">How eligibility works:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Each member must contribute <strong>contribution amount × their position</strong> before their turn</li>
            <li>Member #1 needs 1× contribution, Member #2 needs 2× contributions, etc.</li>
            <li>If a member hasn't paid enough by their turn, they are <strong>skipped automatically</strong></li>
            <li>The payout goes to the next eligible member in the queue</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
