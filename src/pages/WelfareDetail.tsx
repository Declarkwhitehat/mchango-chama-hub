import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Users, Wallet, History, Settings, Loader2, Copy, CheckCircle, XCircle, Clock, AlertTriangle, LogOut, Search, FileText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { WelfareExecutivePanel } from "@/components/welfare/WelfareExecutivePanel";
import { WelfareContributionForm } from "@/components/welfare/WelfareContributionForm";
import { WelfareWithdrawalRequest } from "@/components/welfare/WelfareWithdrawalRequest";
import { WelfareApprovalCard } from "@/components/welfare/WelfareApprovalCard";
import { WelfareContributionCycleManager } from "@/components/welfare/WelfareContributionCycleManager";
import { WelfareTransactionLog } from "@/components/welfare/WelfareTransactionLog";
import { VerificationRequestButton } from "@/components/VerificationRequestButton";
import { WelfareExecutiveChangeBanner } from "@/components/welfare/WelfareExecutiveChangeBanner";
import { WelfarePaymentLookup } from "@/components/welfare/WelfarePaymentLookup";
import { WelfareConstitution } from "@/components/welfare/WelfareConstitution";
import { WelfareWithdrawalStatus } from "@/components/welfare/WelfareWithdrawalStatus";
import { WelfareCycleStatus } from "@/components/welfare/WelfareCycleStatus";
import { WelfareContributionReport } from "@/components/welfare/WelfareContributionReport";

const WelfareDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [welfare, setWelfare] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);

  useEffect(() => {
    if (id) fetchWelfare();
    if (user) checkAdmin();
  }, [id, user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const fetchWelfare = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke(`welfare-crud/${id}`, { method: 'GET' });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWelfare(data.data);

      if (user && data.data?.welfare_members) {
        const myMember = data.data.welfare_members.find((m: any) => m.user_id === user.id && m.status === 'active');
        setMyRole(myMember?.role || null);
        setMyMemberId(myMember?.id || null);
      }
    } catch (error: any) {
      console.error('Error fetching welfare:', error);
      toast.error("Failed to load welfare details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!welfare) {
    return (
      <Layout>
        <div className="container px-4 py-8 text-center">
          <p className="text-muted-foreground">Welfare group not found</p>
          <Button onClick={() => navigate('/welfare')} className="mt-4">Back to Welfare Groups</Button>
        </div>
      </Layout>
    );
  }

  const activeMembers = welfare.welfare_members?.filter((m: any) => m.status === 'active') || [];
  const isChairman = myRole === 'chairman';
  const isSecretary = myRole === 'secretary';
  const isTreasurer = myRole === 'treasurer';
  const isExecutive = isChairman || isSecretary || isTreasurer;
  const isMember = !!myRole;

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const { data, error } = await supabase.functions.invoke(`welfare-members?action=leave&welfare_id=${id}`, { method: 'DELETE' });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("You have left the welfare group");
      navigate('/welfare');
    } catch (error: any) {
      toast.error(error.message || "Failed to leave welfare");
    } finally {
      setLeaving(false);
    }
  };

  return (
    <Layout>
      <div className="container px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                {welfare.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{welfare.description}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {myRole && <Badge variant="default" className="capitalize">{myRole}</Badge>}
                {welfare.is_frozen && <Badge variant="destructive">Frozen</Badge>}
                {welfare.is_verified && <Badge className="bg-green-500">Verified</Badge>}
                <VerificationRequestButton
                  entityType="welfare"
                  entityId={welfare.id}
                  entityName={welfare.name}
                  isVerified={welfare.is_verified}
                  isOwner={isChairman || welfare.created_by === user?.id}
                />
              </div>
            </div>
            {isMember && !isChairman && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive hover:bg-destructive/10">
                    <LogOut className="h-4 w-4 mr-1" />
                    Leave
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave Welfare Group?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to leave "{welfare.name}"? You will lose access to the group and your membership will end.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLeave} disabled={leaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {leaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Leave Group
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {/* Group Code */}
          {welfare.group_code && (
            <Card className="mt-4 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
              <CardContent className="pt-5 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h4 className="font-semibold text-foreground">Invite Code</h4>
                </div>
                <div className="p-3 rounded-lg bg-background border-2 border-primary/30 flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold text-primary tracking-widest">{welfare.group_code}</span>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(welfare.group_code);
                        toast.success("Invite code copied!");
                      } catch { toast.error("Failed to copy"); }
                    }}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors"
                  >
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How to join</p>
                  <ol className="grid grid-cols-1 gap-1 text-sm text-foreground">
                    {[
                      "Share this code with members you want to invite",
                      "They go to Welfare → Join Welfare Group",
                      `Enter code: ${welfare.group_code}`,
                      "Click 'Join Welfare' to become a member",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Executive Change Security Banner */}
        <WelfareExecutiveChangeBanner welfareId={welfare.id} onCooldownActive={setCooldownActive} />

        {/* Frozen Warning */}
        {welfare.is_frozen && (
          <Card className="mb-4 border-destructive">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Welfare is Frozen</p>
                  <p className="text-sm">{welfare.frozen_reason || 'Contact admin to unfreeze.'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Financial Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Collected</p>
              <p className="text-lg font-bold">KES {Number(welfare.total_gross_collected || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Commission Paid</p>
              <p className="text-lg font-bold">KES {Number(welfare.total_commission_paid || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="text-lg font-bold text-primary">KES {Number(welfare.available_balance || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Withdrawn</p>
              <p className="text-lg font-bold">KES {Number(welfare.total_withdrawn || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${Math.min(3, 6 + (isExecutive ? 2 : 0))}, 1fr)` }}>
            <TabsTrigger value="overview" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Overview</TabsTrigger>
            <TabsTrigger value="contribute" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Contribute</TabsTrigger>
            <TabsTrigger value="transactions" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">History</TabsTrigger>
            <TabsTrigger value="payments" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Payments</TabsTrigger>
            <TabsTrigger value="documents" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Documents</TabsTrigger>
            {isExecutive && <TabsTrigger value="withdraw" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Withdraw</TabsTrigger>}
            {isExecutive && <TabsTrigger value="manage" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Manage</TabsTrigger>}
            <TabsTrigger value="members" className="text-sm sm:text-lg font-extrabold px-2 py-4 h-auto whitespace-normal leading-tight">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Active Cycle Status with unpaid tracking */}
            {isMember && (
              <WelfareCycleStatus
                welfareId={welfare.id}
                members={activeMembers}
              />
            )}

            {isMember && <WelfareWithdrawalStatus welfareId={welfare.id} isAdmin={isAdmin} />}
            <WelfareExecutivePanel
              members={activeMembers}
              welfareId={welfare.id}
              isChairman={isChairman}
              isAdmin={isAdmin}
              onRoleAssigned={fetchWelfare}
            />
          </TabsContent>

          <TabsContent value="contribute">
            {myRole ? (
              <WelfareContributionForm
                welfareId={welfare.id}
                memberId={myMemberId!}
                memberCode={activeMembers.find((m: any) => m.user_id === user?.id)?.member_code || ''}
                contributionAmount={welfare.contribution_amount}
                paybillAccountId={welfare.paybill_account_id}
                onContributed={fetchWelfare}
              />
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Join this welfare group to contribute</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="transactions">
            <WelfareTransactionLog welfareId={welfare.id} />
          </TabsContent>

          <TabsContent value="payments">
            <WelfarePaymentLookup welfareId={welfare.id} />
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <GroupDocuments
              entityType="welfare"
              entityId={welfare.id}
              canUpload={isExecutive}
            />
            {/* PDF Report for all members */}
            {isMember && (
              <WelfareContributionReport welfareId={welfare.id} welfareName={welfare.name} />
            )}
          </TabsContent>

          {isExecutive && (
            <TabsContent value="withdraw">
              {(isChairman || isTreasurer) && !welfare.is_frozen && !cooldownActive && (
                <WelfareWithdrawalRequest
                  welfareId={welfare.id}
                  availableBalance={welfare.available_balance}
                  onRequested={fetchWelfare}
                />
              )}
              {cooldownActive && !welfare.is_frozen && (
                <Card>
                  <CardContent className="py-8 text-center text-destructive">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">Withdrawals are blocked</p>
                    <p className="text-sm text-muted-foreground mt-1">Executive members have recently changed. A security cooldown is active.</p>
                  </CardContent>
                </Card>
              )}
              {(isSecretary || isTreasurer) && (
                <WelfareApprovalCard welfareId={welfare.id} onDecision={fetchWelfare} />
              )}
              {welfare.is_frozen && (
                <Card>
                  <CardContent className="py-8 text-center text-destructive">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <p>Withdrawals are disabled while the welfare is frozen.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}

          {isExecutive && (
            <TabsContent value="manage" className="space-y-4">
              <WelfareContributionCycleManager welfareId={welfare.id} />
            </TabsContent>
          )}

          <TabsContent value="members" className="space-y-4">
            {/* Success Rate Summary */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-bold text-primary">{activeMembers.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xs text-muted-foreground">Avg Contribution</p>
                  <p className="text-2xl font-bold">
                    KES {activeMembers.length > 0
                      ? Math.round(activeMembers.reduce((sum: number, m: any) => sum + Number(m.total_contributed || 0), 0) / activeMembers.length).toLocaleString()
                      : '0'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Members List with Success Rate */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Members ({activeMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeMembers
                    .slice()
                    .sort((a: any, b: any) => Number(b.total_contributed || 0) - Number(a.total_contributed || 0))
                    .map((member: any, index: number) => {
                      const contributed = Number(member.total_contributed || 0);
                      const maxContribution = Math.max(...activeMembers.map((m: any) => Number(m.total_contributed || 0)), 1);
                      const successRate = Math.round((contributed / maxContribution) * 100);
                      return (
                        <div key={member.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-primary">#{index + 1}</span>
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{member.profiles?.full_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground font-mono">{member.member_code || 'No ID'}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-sm font-bold">KES {contributed.toLocaleString()}</span>
                              <Badge variant="outline" className="capitalize text-xs">{member.role}</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${successRate}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground w-10 text-right">{successRate}%</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default WelfareDetail;
