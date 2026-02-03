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
import { CycleCompleteBanner } from "@/components/chama/CycleCompleteBanner";
import { CycleCompleteManager } from "@/components/chama/CycleCompleteManager";
import { PaymentStatusManager } from "@/components/chama/PaymentStatusManager";
import { PaymentTransparency } from "@/components/chama/PaymentTransparency";
import { SkippedMemberAlert } from "@/components/chama/SkippedMemberAlert";
import { FirstPaymentStatus } from "@/components/chama/FirstPaymentStatus";
import { PreStartDashboard } from "@/components/chama/PreStartDashboard";
import { WhatsAppLinkManager } from "@/components/chama/WhatsAppLinkManager";
import { ChamaEndDate } from "@/components/chama/ChamaEndDate";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { VerificationRequestButton } from "@/components/VerificationRequestButton";
import { Users, Calendar, TrendingUp, Loader2, Info, Clock, AlertTriangle, Wallet, MessageCircle } from "lucide-react";
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
  min_members?: number;
  commission_rate: number;
  status: string;
  created_at: string;
  start_date?: string | null;
  every_n_days_count?: number;
  current_cycle_round?: number;
  last_cycle_completed_at?: string;
  accepting_rejoin_requests?: boolean;
  whatsapp_link?: string | null;
  total_gross_collected?: number;
  total_commission_paid?: number;
  available_balance?: number;
  total_withdrawn?: number;
  is_verified?: boolean;
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
    status: string;
    joined_at: string;
    user_id?: string;
    first_payment_completed?: boolean;
    first_payment_at?: string;
    removal_reason?: string;
    profiles: {
      full_name: string;
      email: string;
      phone?: string;
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
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    loadChama();

    // Subscribe to membership changes for real-time updates
    const channel = supabase
      .channel(`chama-members-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chama_members',
          filter: `chama_id=eq.${id}`
        },
        (payload) => {
          console.log('Member status changed:', payload);
          // Reload chama data when any member's status changes
          loadChama();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const loadChama = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Session Expired",
          description: "Please log in again",
          variant: "destructive",
        });
        window.location.href = '/auth';
        return;
      }

      console.log('Loading chama:', id);
      
      const { data, error } = await supabase.functions.invoke(`chama-crud/${id}`, {
        method: 'GET'
      });

      if (error) {
        console.error("Error loading chama:", error);
        toast({
          title: "Failed to Load Chama",
          description: error.message || "Could not retrieve chama details",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (!data || !data.data) {
        console.error("No chama data returned");
        toast({
          title: "No Data",
          description: "Chama details could not be loaded",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

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

      // Use chama's available_balance if set (already net of commission)
      // Fall back to calculating from contributions if not available
      const chamaAvailableBalance = Number(data.data.available_balance) || 0;
      const chamaTotalWithdrawn = Number(data.data.total_withdrawn) || 0;
      
      if (chamaAvailableBalance > 0 || data.data.total_gross_collected) {
        // Use the tracked net balance
        setTotalContributions(Math.max(0, chamaAvailableBalance - chamaTotalWithdrawn));
      } else {
        // Fallback: Calculate from contributions with commission deduction
        const { data: contributionsData } = await supabase
          .from('contributions')
          .select('amount')
          .eq('chama_id', data.data.id)
          .eq('status', 'completed');

        const { data: withdrawalsData } = await supabase
          .from('withdrawals')
          .select('net_amount, status')
          .eq('chama_id', data.data.id)
          .in('status', ['approved', 'completed', 'processing']);

        const grossContrib = contributionsData?.reduce((sum, contrib) => sum + Number(contrib.amount), 0) || 0;
        const totalWithdrawn = withdrawalsData?.reduce((sum, w) => sum + Number(w.net_amount), 0) || 0;
        
        // Apply commission rate to get net available
        const commissionRate = data.data.commission_rate || 0.05;
        const netContrib = grossContrib * (1 - commissionRate);
        
        setTotalContributions(Math.max(0, netContrib - totalWithdrawn));
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

  const handleStartChama = async () => {
    if (!chama) return;

    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('chama-start', {
        body: { chamaId: chama.id },
      });

      if (error) throw error;

      // Handle the new response format with summary
      const summary = data?.summary;
      
      if (summary) {
        toast({
          title: "Chama Started!",
          description: `${summary.activeMembers} active members. ${summary.removedMembers > 0 ? `${summary.removedMembers} member(s) removed for not paying.` : ''} First payout: ${summary.firstBeneficiary}.`,
        });
      } else {
        toast({
          title: "Chama Started!",
          description: `${data.notificationsSent} members have been notified via SMS.`,
        });
      }

      // Reload chama data to reflect new status
      await loadChama();
    } catch (error: any) {
      console.error("Error starting chama:", error);
      
      // Parse error details if available
      let errorMessage = error.message || "Could not start the chama";
      if (error.context?.body) {
        try {
          const errorBody = JSON.parse(error.context.body);
          errorMessage = errorBody.details?.message || errorBody.error || errorMessage;
        } catch {}
      }
      
      toast({
        title: "Failed to Start Chama",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
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
  const isPendingStatus = chama.status === 'pending';
  const isActive = chama.status === 'active';
  const isCycleComplete = chama.status === 'cycle_complete';

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <div className="flex gap-2">
                <Badge>
                  {approvedMembers.length}/{chama.max_members} members
                </Badge>
                {isPendingStatus && <Badge variant="secondary">Pending Start</Badge>}
                {isActive && <Badge variant="default">Active</Badge>}
                {isCycleComplete && <Badge variant="secondary">Cycle Complete</Badge>}
              </div>
              <div className="flex gap-2">
                {isManager && <Badge variant="default">Manager</Badge>}
                {isPending && <Badge variant="secondary">Pending Approval</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-2xl flex items-center gap-2">
                {chama.name}
                {chama.is_verified && <VerifiedBadge size="md" />}
              </CardTitle>
              {isManager && (
                <VerificationRequestButton
                  entityType="chama"
                  entityId={chama.id}
                  entityName={chama.name}
                  isVerified={chama.is_verified || false}
                  isOwner={isManager}
                />
              )}
            </div>
            <CardDescription>Founded by {chama.profiles?.full_name || 'Unknown'}</CardDescription>
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

        {/* Pre-Start Dashboard - Manager view when pending */}
        {isManager && isPendingStatus && (
          <PreStartDashboard
            chamaId={chama.id}
            chamaName={chama.name}
            contributionAmount={chama.contribution_amount}
            minMembers={chama.min_members || 2}
            members={chama.chama_members.filter(m => m.approval_status === 'approved').map(m => ({
              id: m.id,
              user_id: m.user_id || '',
              order_index: m.order_index,
              member_code: m.member_code,
              first_payment_completed: m.first_payment_completed || false,
              first_payment_at: m.first_payment_at || null,
              approval_status: m.approval_status,
              is_manager: m.is_manager,
              joined_at: m.joined_at,
              profiles: m.profiles ? { full_name: m.profiles.full_name, phone: m.profiles.phone } : null
            }))}
            isManager={isManager}
            onStart={handleStartChama}
            isStarting={isStarting}
          />
        )}

        {/* First Payment Status - Non-manager members when pending */}
        {isMember && isPendingStatus && !isManager && currentUserMembership && (
          <FirstPaymentStatus
            memberStatus={{
              first_payment_completed: currentUserMembership.first_payment_completed || false,
              first_payment_at: currentUserMembership.first_payment_at,
              order_index: currentUserMembership.order_index,
              member_code: currentUserMembership.member_code,
              approval_status: currentUserMembership.approval_status
            }}
            contributionAmount={chama.contribution_amount}
            chamaName={chama.name}
            chamaStatus={chama.status}
          />
        )}

        {/* Chama End Date - Show when chama is active */}
        {isActive && (
          <ChamaEndDate
            startDate={chama.start_date || chama.created_at}
            contributionFrequency={chama.contribution_frequency}
            everyNDaysCount={chama.every_n_days_count}
            memberCount={approvedMembers.length}
            status={chama.status}
          />
        )}

        {/* Cycle Complete Banner - Visible to members */}
        {isMember && isCycleComplete && currentUserMembership?.user_id && (
          <CycleCompleteBanner 
            chamaId={chama.id} 
            chamaName={chama.name}
            userId={currentUserMembership.user_id}
          />
        )}

        {/* Cycle Complete Manager - Visible to managers */}
        {isManager && isCycleComplete && (
          <CycleCompleteManager
            chamaId={chama.id}
            chamaName={chama.name}
            minMembers={chama.min_members || 5}
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

        {/* Withdrawal Status Section - Only show when funds are available */}
        {isMember && isActive && totalContributions > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Withdrawal Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isMyTurn ? (
                <>
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="bg-primary p-2 rounded-full">
                        <TrendingUp className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-primary">It's Your Turn!</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          You can now request a withdrawal from the chama pool.
                        </p>
                      </div>
                    </div>
                  </div>
                  <WithdrawalButton
                    chamaId={chama.id}
                    totalAvailable={totalContributions}
                    commissionRate={chama.commission_rate || 0.05}
                    onSuccess={loadChama}
                  />
                </>
              ) : currentTurnMemberId ? (
                <div className="p-4 bg-muted border rounded-lg">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">
                        It's {approvedMembers.find(m => m.id === currentTurnMemberId)?.profiles?.full_name || 'Unknown'}'s turn
                      </p>
                      {nextTurnDates[currentUserMembership.id] && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Your estimated turn: <span className="font-medium text-primary">
                            {nextTurnDates[currentUserMembership.id].toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Payouts follow the order members joined. Make sure you complete your contributions 
                        before your turn to remain eligible.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Skipped Member Alert - Show if current user was skipped */}
        {isMember && isActive && currentUserMembership && (
          <SkippedMemberAlert
            chamaId={chama.id}
            memberId={currentUserMembership.id}
            contributionAmount={chama.contribution_amount}
          />
        )}

        {/* Status Messages for Non-Active States */}
        {isMember && isPending && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Chama Not Started Yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Withdrawals will be available once the manager starts the Chama. 
                    The chama needs at least {chama.min_members || 5} members to begin.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isMember && isCycleComplete && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">Cycle Complete</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The current cycle has completed. Withdrawals will resume when a new cycle begins.
                    Check the rejoin request section above if you'd like to participate in the next cycle.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!currentUserMembership && !isAdmin && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Not a Member</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You are not a member of this Chama. Request to join to participate in 
                    contributions and withdrawals.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {currentUserMembership && currentUserMembership.approval_status === 'pending' && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">Pending Approval</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your membership request is pending approval by the manager. 
                    Once approved, you'll be added to the payout queue.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Form - Only visible to approved members when chama is active */}
        {isMember && isActive && (
          <ChamaPaymentForm
            chamaId={chama.id}
            currentMemberId={currentUserMembership.id}
            contributionAmount={chama.contribution_amount}
            onPaymentSuccess={loadChama}
          />
        )}

        {/* Tabs - Only visible to approved members and admins */}
        {hasViewAccess && (
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="w-full overflow-x-auto flex-nowrap justify-start md:justify-center">
              <TabsTrigger value="dashboard" className="text-xs sm:text-sm">Dashboard</TabsTrigger>
              <TabsTrigger value="transparency" className="text-xs sm:text-sm">Transparency</TabsTrigger>
              {isManager && <TabsTrigger value="payments" className="text-xs sm:text-sm">Payments</TabsTrigger>}
              <TabsTrigger value="members" className="text-xs sm:text-sm">Members</TabsTrigger>
              <TabsTrigger value="details" className="text-xs sm:text-sm">Details</TabsTrigger>
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

            <TabsContent value="transparency">
              <PaymentTransparency
                chamaId={chama.id}
                contributionAmount={chama.contribution_amount}
              />
            </TabsContent>

            {isManager && (
              <TabsContent value="payments">
                <PaymentStatusManager
                  chamaId={chama.id}
                  chamaName={chama.name}
                  contributionAmount={chama.contribution_amount}
                  commissionRate={chama.commission_rate}
                />
              </TabsContent>
            )}

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle>Group Members ({approvedMembers.length})</CardTitle>
                  <CardDescription>Approved members by join order</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* WhatsApp Group Join Button */}
                  {chama.whatsapp_link && (
                    <a
                      href={chama.whatsapp_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full p-3 bg-primary/10 border border-primary/20 rounded-lg text-primary hover:bg-primary/20 transition-colors font-medium"
                    >
                      <MessageCircle className="h-5 w-5" />
                      Join WhatsApp Group
                    </a>
                  )}

                  <div className="space-y-4">
                     {approvedMembers
                      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                      .map((member) => (
                        <div key={member.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>
                                {member.profiles?.full_name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">
                                {member.profiles?.full_name || 'Unknown'}
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

            <TabsContent value="details" className="space-y-4">
              {/* WhatsApp Group Link */}
              <WhatsAppLinkManager
                chamaId={chama.id}
                currentLink={chama.whatsapp_link}
                isManager={isManager}
                onUpdate={loadChama}
              />

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
