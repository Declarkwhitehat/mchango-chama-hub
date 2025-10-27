import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChamaInviteManager } from "@/components/ChamaInviteManager";
import { ChamaPendingRequests } from "@/components/ChamaPendingRequests";
import { MemberDashboard } from "@/components/MemberDashboard";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { ChamaPaymentForm } from "@/components/ChamaPaymentForm";
import { WithdrawalButton } from "@/components/WithdrawalButton";
import { WithdrawalHistory } from "@/components/WithdrawalHistory";
import { Users, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ChamaData {
  id: string;
  name: string;
  slug: string;
  description: string;
  contribution_amount: number;
  contribution_frequency: string;
  max_members: number;
  commission_rate: number;
  created_at: string;
  every_n_days_count?: number;
  profiles: {
    full_name: string;
    email: string;
  };
  chama_members: Array<{
    id: string;
    member_code: string;
    order_index: number;
    is_manager: boolean;
    approval_status: string;
    joined_at: string;
    profiles: {
      full_name: string;
      email: string;
    };
  }>;
}

const ChamaDetail = () => {
  const { id } = useParams();
  const [chama, setChama] = useState<ChamaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserMembership, setCurrentUserMembership] = useState<any>(null);
  const [currentTurnMemberId, setCurrentTurnMemberId] = useState<string | null>(null);
  const [nextTurnDates, setNextTurnDates] = useState<Record<string, Date>>({});
  const [totalContributions, setTotalContributions] = useState<number>(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadChama();
  }, [id]);

  const loadChama = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke(`chama-crud/${id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) throw error;

      setChama(data.data);

      // Check current user's membership
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Check if user is admin
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        
        setIsAdmin(!!roleData);

        if (data.data.chama_members) {
          const membership = data.data.chama_members.find(
            (m: any) => m.user_id === user.id
          );
          setCurrentUserMembership(membership);
        }
      }

      // Fetch actual contributions total
      const { data: contributionsData, error: contribError } = await supabase
        .from('contributions')
        .select('amount')
        .eq('chama_id', data.data.id)
        .eq('status', 'completed');

      if (!contribError && contributionsData) {
        const total = contributionsData.reduce((sum, contrib) => sum + Number(contrib.amount), 0);
        setTotalContributions(total);
      } else {
        setTotalContributions(0);
      }

      // Calculate whose turn it is and next turn dates
      await calculateTurns(data.data);
    } catch (error: any) {
      console.error("Error loading chama:", error);
      toast({
        title: "Error",
        description: "Failed to load chama details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateTurns = async (chamaData: ChamaData) => {
    try {
      const approvedMembers = chamaData.chama_members
        ?.filter(m => m.approval_status === 'approved')
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) || [];

      if (approvedMembers.length === 0) return;

      // Get completed withdrawals for this chama
      const { data: completedWithdrawals } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('chama_id', chamaData.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: true });

      const withdrawalCount = completedWithdrawals?.length || 0;
      const currentTurnIndex = withdrawalCount % approvedMembers.length;
      const currentTurnMember = approvedMembers[currentTurnIndex];
      
      setCurrentTurnMemberId(currentTurnMember.id);

      // Calculate estimated turn dates for each member
      const turnDates: Record<string, Date> = {};
      const cycleLength = getCycleLengthInDays(chamaData.contribution_frequency, chamaData.every_n_days_count);
      const createdDate = new Date(chamaData.created_at);

      approvedMembers.forEach((member, index) => {
        // Calculate how many full cycles until this member's turn
        let turnsUntilMember = index - currentTurnIndex;
        if (turnsUntilMember < 0) turnsUntilMember += approvedMembers.length;
        
        const daysUntilTurn = turnsUntilMember * cycleLength * approvedMembers.length;
        const memberTurnDate = new Date(createdDate);
        memberTurnDate.setDate(memberTurnDate.getDate() + daysUntilTurn + (withdrawalCount * cycleLength * approvedMembers.length));
        
        turnDates[member.id] = memberTurnDate;
      });

      setNextTurnDates(turnDates);
    } catch (error) {
      console.error("Error calculating turns:", error);
    }
  };

  const getCycleLengthInDays = (frequency: string, everyNDays?: number): number => {
    switch (frequency) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'monthly': return 30;
      case 'every_n_days': return everyNDays || 7;
      default: return 7;
    }
  };

  if (isLoading) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Chama not found</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const approvedMembers = chama.chama_members?.filter(m => m.approval_status === 'approved') || [];
  const isManager = currentUserMembership?.is_manager && currentUserMembership?.approval_status === 'approved';
  const isMember = currentUserMembership?.approval_status === 'approved';
  const isPending = currentUserMembership?.approval_status === 'pending';
  const isMyTurn = currentUserMembership?.id === currentTurnMemberId;
  const hasViewAccess = isAdmin || isMember; // Admins can view without being members

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge>
                {approvedMembers.length}/{chama.max_members} members
              </Badge>
              {isManager && <Badge variant="default">Manager</Badge>}
              {isPending && <Badge variant="secondary">Pending Approval</Badge>}
            </div>
            <CardTitle className="text-2xl">{chama.name}</CardTitle>
            <CardDescription>Founded by {chama.profiles.full_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground leading-relaxed">{chama.description}</p>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Collected</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {totalContributions.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Contribution</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {chama.contribution_amount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Frequency: {chama.contribution_frequency}</span>
            </div>
          </CardContent>
        </Card>

        {/* Commission Display - Visible to all approved members and admins */}
        {hasViewAccess && (
          <CommissionDisplay 
            totalCollected={totalContributions}
            commissionRate={chama.commission_rate || 0.05}
            type="chama"
            showBreakdown={true}
          />
        )}

        {/* Manager Tools */}
        {isManager && (
          <ChamaInviteManager chamaId={chama.id} chamaSlug={chama.slug} isManager={true} />
        )}

        {/* Pending Join Requests - Visible to all members and admins */}
        {hasViewAccess && (
          <ChamaPendingRequests 
            chamaId={chama.id} 
            isManager={isManager} 
            onUpdate={loadChama}
          />
        )}

        {/* Withdrawal Button - Only for member whose turn it is */}
        {isMember && isMyTurn && (
          <WithdrawalButton
            chamaId={chama.id}
            totalAvailable={totalContributions}
            commissionRate={chama.commission_rate || 0.05}
            onSuccess={loadChama}
          />
        )}

        {/* Show turn information to all members */}
        {isMember && !isMyTurn && currentTurnMemberId && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {approvedMembers.find(m => m.id === currentTurnMemberId)?.profiles.full_name}'s turn to withdraw
                </p>
                {nextTurnDates[currentUserMembership.id] && (
                  <p className="text-lg font-semibold text-primary">
                    Your turn: {nextTurnDates[currentUserMembership.id].toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Form - Only visible to approved members */}
        {isMember && (
          <ChamaPaymentForm
            chamaId={chama.id}
            currentMemberId={currentUserMembership.id}
            contributionAmount={chama.contribution_amount}
            onPaymentSuccess={loadChama}
          />
        )}

        {/* Withdrawal History - Visible to all approved members and admins */}
        {hasViewAccess && (
          <WithdrawalHistory chamaId={chama.id} />
        )}

        {/* Tabs - Only visible to approved members and admins */}
        {hasViewAccess && (
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              {isMember && <MemberDashboard chamaId={chama.id} />}
              {isAdmin && !isMember && (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">
                      Admin view: Join as a member to see member dashboard
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle>Group Members ({approvedMembers.length})</CardTitle>
                  <CardDescription>Approved members by join order</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                     {approvedMembers
                      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                      .map((member) => (
                        <div key={member.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>
                                {member.profiles.full_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">
                                {member.profiles.full_name}
                                {member.is_manager && (
                                  <Badge variant="outline" className="ml-2">Manager</Badge>
                                )}
                                {member.id === currentTurnMemberId && (
                                  <Badge variant="default" className="ml-2">Current Turn</Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.member_code} • Position #{member.order_index}
                              </p>
                              {nextTurnDates[member.id] && (
                                <p className="text-xs text-muted-foreground">
                                  Next turn: {nextTurnDates[member.id].toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Chama Details</CardTitle>
                  <CardDescription>Group information and settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {new Date(chama.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contribution Frequency</p>
                    <p className="font-medium capitalize">{chama.contribution_frequency}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Member Capacity</p>
                    <p className="font-medium">
                      {approvedMembers.length} / {chama.max_members} members
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Pending approval message */}
        {isPending && (
          <Card>
            <CardContent className="pt-6 space-y-2">
              <p className="text-center text-lg font-semibold text-primary">
                Pending Approval
              </p>
              <p className="text-center text-muted-foreground">
                Your join request is being reviewed by the chama manager. You'll be notified once approved.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Non-member view */}
        {!hasViewAccess && !isPending && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                You need to join this chama to view member details.
                <br />
                Ask a manager for an invite code.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default ChamaDetail;
