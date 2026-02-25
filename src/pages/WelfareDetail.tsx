import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Users, Wallet, History, Settings, Loader2, Copy, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { WelfareExecutivePanel } from "@/components/welfare/WelfareExecutivePanel";
import { WelfareContributionForm } from "@/components/welfare/WelfareContributionForm";
import { WelfareWithdrawalRequest } from "@/components/welfare/WelfareWithdrawalRequest";
import { WelfareApprovalCard } from "@/components/welfare/WelfareApprovalCard";
import { WelfareContributionCycleManager } from "@/components/welfare/WelfareContributionCycleManager";
import { WelfareTransactionLog } from "@/components/welfare/WelfareTransactionLog";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";

const WelfareDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [welfare, setWelfare] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchWelfare();
  }, [id]);

  const fetchWelfare = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke(`welfare-crud/${id}`, { method: 'GET' });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWelfare(data.data);

      // Find current user's role
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
              <div className="flex gap-2 mt-2">
                {myRole && <Badge variant="default" className="capitalize">{myRole}</Badge>}
                {welfare.is_frozen && <Badge variant="destructive">Frozen</Badge>}
                {welfare.is_verified && <Badge className="bg-green-500">Verified</Badge>}
              </div>
            </div>
          </div>

          {/* Group Code */}
          {welfare.group_code && (
            <div className="mt-4">
              <CopyableUniqueId
                label="Welfare Group Code"
                uniqueId={welfare.group_code}
              />
            </div>
          )}
        </div>

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
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 mb-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="contribute" className="text-xs sm:text-sm">Contribute</TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs sm:text-sm">History</TabsTrigger>
            {isExecutive && <TabsTrigger value="withdraw" className="text-xs sm:text-sm">Withdraw</TabsTrigger>}
            {(isChairman || isSecretary) && <TabsTrigger value="manage" className="text-xs sm:text-sm">Manage</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <WelfareExecutivePanel
              members={activeMembers}
              welfareId={welfare.id}
              isChairman={isChairman}
              onRoleAssigned={fetchWelfare}
            />

            {/* Members list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Members ({activeMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeMembers.map((member: any) => (
                    <div key={member.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{member.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{member.member_code}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          KES {Number(member.total_contributed || 0).toLocaleString()}
                        </span>
                        <Badge variant="outline" className="capitalize text-xs">{member.role}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contribute">
            {myRole ? (
              <WelfareContributionForm
                welfareId={welfare.id}
                memberId={myMemberId!}
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

          {isExecutive && (
            <TabsContent value="withdraw">
              {(isChairman || isTreasurer) && !welfare.is_frozen && (
                <WelfareWithdrawalRequest
                  welfareId={welfare.id}
                  availableBalance={welfare.available_balance}
                  onRequested={fetchWelfare}
                />
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

          {(isChairman || isSecretary) && (
            <TabsContent value="manage" className="space-y-4">
              {isSecretary && (
                <WelfareContributionCycleManager welfareId={welfare.id} />
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
};

export default WelfareDetail;
