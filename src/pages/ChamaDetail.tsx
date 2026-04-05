import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChamaInviteManager } from "@/components/ChamaInviteManager";
import { ChamaPendingRequests } from "@/components/ChamaPendingRequests";
import { MemberDashboard } from "@/components/MemberDashboard";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { ChamaPaymentForm } from "@/components/ChamaPaymentForm";
import { OverpaymentWallet } from "@/components/chama/OverpaymentWallet";

import { CycleCompleteBanner } from "@/components/chama/CycleCompleteBanner";
import { CycleCompleteManager } from "@/components/chama/CycleCompleteManager";
import { PaymentStatusManager } from "@/components/chama/PaymentStatusManager";

import { SkippedMemberAlert } from "@/components/chama/SkippedMemberAlert";
import { FirstPaymentStatus } from "@/components/chama/FirstPaymentStatus";
import { PreStartDashboard } from "@/components/chama/PreStartDashboard";
import { WhatsAppLinkManager } from "@/components/chama/WhatsAppLinkManager";
import { ChamaEndDate } from "@/components/chama/ChamaEndDate";
// CyclePaymentStatus now used only inside MemberDashboard
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { VerificationRequestButton } from "@/components/VerificationRequestButton";
import { ChamaChatPanel } from "@/components/chama/ChamaChatPanel";
import { TrustScoreBadge } from "@/components/chama/TrustScoreBadge";
import { GroupDocuments } from "@/components/GroupDocuments";

import { Users, Calendar, TrendingUp, Loader2, Info, Clock, AlertTriangle, Wallet, MessageCircle, XCircle, CheckCircle2, CheckCircle, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";


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
  group_code?: string;
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
    missed_payments_count?: number;
    balance_deficit?: number;
    was_skipped?: boolean;
    rescheduled_to_position?: number | null;
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
  const [memberPaymentStatuses, setMemberPaymentStatuses] = useState<Record<string, boolean>>({});
  const [memberTrustScores, setMemberTrustScores] = useState<Record<string, number>>({});
  const [rejoinSummary, setRejoinSummary] = useState<{ approvedCount: number; approvedMembers: Array<{ id: string; user_id: string; full_name: string }> } | null>(null);
  const [completedCyclesCount, setCompletedCyclesCount] = useState(0);
  const [totalCyclesCount, setTotalCyclesCount] = useState(0);
  const [paidOutMemberIds, setPaidOutMemberIds] = useState<Set<string>>(new Set());

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
      
      console.log('Fetching chama with id/slug:', id);
      
      // Use POST with chama_id in body for reliable fetching
      let data, error;
      try {
        const response = await supabase.functions.invoke('chama-crud', {
          method: 'POST',
          body: { chama_id: id }
        });
        data = response.data;
        error = response.error;
        console.log('Chama invoke response:', JSON.stringify({ data, error, hasData: !!data }));
      } catch (invokeError: any) {
        console.error('Invoke exception:', invokeError);
        error = invokeError;
      }

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

      // Total Collected = available_balance (net pool balance after commission and withdrawals)
      const chamaAvailableBalance = Number(data.data.available_balance) || 0;
      setTotalContributions(Math.max(0, chamaAvailableBalance));

      // Calculate whose turn it is and next turn dates - only for active chamas
      if (data.data.status === 'active') {
        await calculateTurns(data.data);
      } else {
        // Clear stale turn data for non-active chamas
        setCurrentTurnMemberId(null);
        setNextTurnDates({});
      }

      // Load rejoin summary for cycle_complete chamas
      if (data.data.status === 'cycle_complete') {
        try {
          const rejoinResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-rejoin/summary/${data.data.id}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          if (rejoinResponse.ok) {
            const rejoinData = await rejoinResponse.json();
            setRejoinSummary(rejoinData);
          }
        } catch (e) {
          console.error('Error loading rejoin summary:', e);
        }
      } else {
        setRejoinSummary(null);
      }

      // Load member payment statuses for current cycle
      if (data.data.status === 'active') {
        try {
          const { data: cycleData } = await supabase.functions.invoke('daily-cycle-manager', {
            body: { action: 'current', chamaId: data.data.id }
          });
          if (cycleData?.payments) {
            const statuses: Record<string, boolean> = {};
            cycleData.payments.forEach((p: any) => {
              if (p.chama_members?.id) {
                statuses[p.chama_members.id] = p.is_paid || false;
              }
            });
            setMemberPaymentStatuses(statuses);
          }
        } catch (e) {
          console.error('Error loading payment statuses:', e);
        }
      }
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
      // Use effective position: rescheduled_to_position if skipped, otherwise order_index
      const getEffectivePosition = (m: any) => 
        (m.was_skipped && m.rescheduled_to_position) ? m.rescheduled_to_position : (m.order_index || 0);

      const approvedMembers = chamaData.chama_members
        ?.filter(m => m.approval_status === 'approved' && m.status !== 'removed')
        .sort((a, b) => getEffectivePosition(a) - getEffectivePosition(b)) || [];

      if (approvedMembers.length === 0) return;

      const cycleLength = getCycleLengthInDays(chamaData.contribution_frequency, chamaData.every_n_days_count);

      // Fetch the current active cycle to get the ACTUAL beneficiary from the database
      let currentBeneficiaryId: string | null = null;
      let currentCycleEndDate: string | null = null;
      let currentCycleNumber: number | null = null;

      try {
        // Fetch all cycles to count completed ones
        const { data: allCycles } = await supabase
          .from('contribution_cycles')
          .select('id, beneficiary_member_id, end_date, cycle_number, is_complete, payout_processed')
          .eq('chama_id', chamaData.id)
          .order('cycle_number', { ascending: true });

        if (allCycles) {
          const completed = allCycles.filter(c => c.is_complete || c.payout_processed);
          setCompletedCyclesCount(completed.length);
          setTotalCyclesCount(approvedMembers.length);

          // Track which members already received payouts
          const paidMembers = new Set<string>();
          completed.forEach(c => {
            if (c.beneficiary_member_id) paidMembers.add(c.beneficiary_member_id);
          });
          setPaidOutMemberIds(paidMembers);

          // Find the current active (incomplete) cycle
          const activeCycle = allCycles.find(c => !c.is_complete);
          if (activeCycle) {
            currentBeneficiaryId = activeCycle.beneficiary_member_id;
            currentCycleEndDate = activeCycle.end_date;
            currentCycleNumber = activeCycle.cycle_number;
          }
        }
      } catch (e) {
        console.error('Error fetching cycles for turns:', e);
      }

      // If we have an actual beneficiary from the cycle, use that as current turn
      if (currentBeneficiaryId) {
        setCurrentTurnMemberId(currentBeneficiaryId);

        // Find the index of the current beneficiary in the sorted member list
        const currentIdx = approvedMembers.findIndex(m => m.id === currentBeneficiaryId);

        // Calculate future turn dates for each member relative to the current cycle
        const turnDates: Record<string, Date> = {};
        const cycleEndDate = currentCycleEndDate ? new Date(currentCycleEndDate) : new Date();

        approvedMembers.forEach((member, idx) => {
          // How many cycles ahead is this member from the current beneficiary?
          let cyclesAhead = idx - currentIdx;
          if (cyclesAhead < 0) cyclesAhead += approvedMembers.length;

          if (cyclesAhead === 0) {
            // This member IS the current beneficiary - their turn is now
            turnDates[member.id] = new Date();
          } else {
            // Their turn is cyclesAhead * cycleLength days after current cycle end
            const turnDate = new Date(cycleEndDate);
            turnDate.setDate(turnDate.getDate() + ((cyclesAhead - 1) * cycleLength));
            turnDates[member.id] = turnDate;
          }
        });

        setNextTurnDates(turnDates);
      } else {
        // Fallback: no active cycle, calculate from start_date
        const baseDate = chamaData.start_date 
          ? new Date(chamaData.start_date) 
          : new Date(chamaData.created_at);
        baseDate.setHours(0, 0, 0, 0);

        const turnDates: Record<string, Date> = {};
        approvedMembers.forEach((member) => {
          const effectivePos = getEffectivePosition(member);
          const orderIdx = (effectivePos || 1) - 1;
          const memberTurnDate = new Date(baseDate);
          memberTurnDate.setDate(memberTurnDate.getDate() + (orderIdx * cycleLength));
          turnDates[member.id] = memberTurnDate;
        });

        // Current turn from elapsed time
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const daysSinceStart = Math.floor((now.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        const currentTurnIndex = Math.min(
          Math.max(0, Math.floor(daysSinceStart / cycleLength) % approvedMembers.length),
          approvedMembers.length - 1
        );
        setCurrentTurnMemberId(approvedMembers[currentTurnIndex].id);
        setNextTurnDates(turnDates);
      }
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

  const approvedMembers = chama.chama_members?.filter(m => m.approval_status === 'approved' && m.status === 'active') || [];
  const isManager = currentUserMembership?.is_manager && currentUserMembership?.approval_status === 'approved' && !['removed'].includes(currentUserMembership?.status);
  const isMember = currentUserMembership?.approval_status === 'approved' && !['removed'].includes(currentUserMembership?.status);
  const isRemovedMember = currentUserMembership?.status === 'removed';
  const isPending = currentUserMembership?.approval_status === 'pending';
  const isMyTurn = currentUserMembership?.id === currentTurnMemberId;
  const hasViewAccess = isAdmin || isMember || isRemovedMember;
  const isPendingStatus = chama.status === 'pending';
  const isActive = chama.status === 'active';
  const isCycleComplete = chama.status === 'cycle_complete';
  const displayMemberCount = isCycleComplete && rejoinSummary ? rejoinSummary.approvedCount : approvedMembers.length;

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <div className="flex gap-2">
                <Badge>
                  {displayMemberCount}/{chama.max_members} members
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

        {/* CyclePaymentStatus removed from here — consolidated into MemberDashboard tab */}

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
            contributionAmount={chama.contribution_amount}
            contributionFrequency={chama.contribution_frequency}
            minMembers={chama.min_members || 5}
          />
        )}

        {/* Cycle Complete Manager - Visible to managers */}
        {isManager && isCycleComplete && (
          <CycleCompleteManager
            chamaId={chama.id}
            chamaName={chama.name}
            minMembers={chama.min_members || 5}
            contributionAmount={chama.contribution_amount}
            contributionFrequency={chama.contribution_frequency}
            everyNDaysCount={chama.every_n_days_count || undefined}
          />
        )}

        {/* Manager Tools */}
        {isManager && (
          <div className="space-y-3">
            <ChamaInviteManager chamaId={chama.id} chamaSlug={chama.slug} isManager={true} />
          </div>
        )}

        {/* Pending Join Requests - Visible to all members and admins */}
        {hasViewAccess && (
          <ChamaPendingRequests 
            chamaId={chama.id} 
            isManager={isManager} 
            onUpdate={loadChama}
          />
        )}

        {/* Payout Info - Automatic payouts, no manual withdrawal */}
        {isMember && isActive && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Payout Schedule
              </CardTitle>
              {totalCyclesCount > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={(completedCyclesCount / totalCyclesCount) * 100} className="flex-1 h-2" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {completedCyclesCount}/{totalCyclesCount} cycles completed
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isMyTurn ? (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary p-2 rounded-full">
                      <TrendingUp className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-primary">You're Next for Payout!</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Once all members pay for this cycle, your payout will be sent automatically to your registered payment method.
                      </p>
                    </div>
                  </div>
                </div>
              ) : currentTurnMemberId ? (
                <div className="p-4 bg-muted border rounded-lg">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">
                        Current recipient: {approvedMembers.find(m => m.id === currentTurnMemberId)?.profiles?.full_name || 'Unknown'}
                      </p>
                      {currentUserMembership && paidOutMemberIds.has(currentUserMembership.id) ? (
                        <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          You already received your payout this round
                        </p>
                      ) : currentUserMembership && nextTurnDates[currentUserMembership.id] ? (
                        <p className="text-sm text-muted-foreground mt-1">
                          Your estimated turn: <span className="font-medium text-primary">
                            {formatDate(nextTurnDates[currentUserMembership.id])}
                          </span>
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-2">
                        Payouts are automatic. When all members pay, funds are sent to the scheduled recipient's M-Pesa.
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

        {/* Red payment banner removed — PaymentCountdownTimer in MemberDashboard handles this */}

        {/* Overpayment Wallet - visible to approved members */}
        {isMember && isActive && (
          <OverpaymentWallet chamaId={chama.id} memberId={currentUserMembership.id} />
        )}

        {/* Payment Form - Only visible to approved members when chama is active */}
        {isMember && isActive && (
          <div id="payment-form-section">
          <ChamaPaymentForm
            chamaId={chama.id}
            currentMemberId={currentUserMembership.id}
            contributionAmount={chama.contribution_amount}
            onPaymentSuccess={loadChama}
          />
          </div>
        )}

        {/* Removed member view - show membership ended info */}
        {isRemovedMember && (
          <MemberDashboard chamaId={chama.id} />
        )}

        {/* Tabs - Only visible to active approved members and admins */}
        {hasViewAccess && !isRemovedMember && (
          <Tabs defaultValue="dashboard" className="w-full">
            <TabsList className="w-full overflow-x-auto flex-nowrap justify-start md:justify-center">
              <TabsTrigger value="dashboard" className="text-xs sm:text-sm">Dashboard</TabsTrigger>
              {isManager && <TabsTrigger value="payments" className="text-xs sm:text-sm">Payments</TabsTrigger>}
              <TabsTrigger value="members" className="text-xs sm:text-sm">Members</TabsTrigger>
              {isMember && <TabsTrigger value="chat" className="text-xs sm:text-sm flex items-center gap-1"><MessageSquare className="h-3 w-3" />Chat</TabsTrigger>}
              <TabsTrigger value="documents" className="text-xs sm:text-sm">Docs</TabsTrigger>
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

            <TabsContent value="members" className="space-y-4">
              {/* WhatsApp Group Link Manager */}
              <WhatsAppLinkManager
                chamaId={chama.id}
                currentLink={chama.whatsapp_link}
                isManager={isManager}
                onUpdate={loadChama}
              />

              <Card>
                <CardHeader>
                  <CardTitle>
                    {isCycleComplete ? `Confirmed Next Cycle Members (${displayMemberCount})` : `Group Members (${displayMemberCount})`}
                  </CardTitle>
                  <CardDescription>
                    {isCycleComplete ? 'Members confirmed for the next cycle' : 'Approved members by join order'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  {/* Cycle Complete: show rejoin-confirmed members */}
                  {isCycleComplete && rejoinSummary ? (
                    <div className="space-y-3">
                      {rejoinSummary.approvedMembers.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No members have confirmed for the next cycle yet.
                        </p>
                      ) : (
                        rejoinSummary.approvedMembers.map((member) => (
                          <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                            <Avatar>
                              <AvatarFallback>
                                {member.full_name?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">{member.full_name}</p>
                              <p className="text-sm text-muted-foreground">
                                <Badge variant="outline" className="text-xs">Confirmed</Badge>
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                  <div className="space-y-3">
                     {approvedMembers
                      .sort((a, b) => {
                        const posA = (a.was_skipped && a.rescheduled_to_position) ? a.rescheduled_to_position : (a.order_index || 0);
                        const posB = (b.was_skipped && b.rescheduled_to_position) ? b.rescheduled_to_position : (b.order_index || 0);
                        return posA - posB;
                      })
                      .map((member) => {
                        const hasPaid = memberPaymentStatuses[member.id];
                        const isPaidKnown = member.id in memberPaymentStatuses;
                        return (
                        <div 
                          key={member.id} 
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isActive && isPaidKnown
                              ? hasPaid 
                                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                                : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                              : 'border-border'
                          }`}
                        >
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
                                {member.member_code} • Position #{(member.was_skipped && member.rescheduled_to_position) ? member.rescheduled_to_position : member.order_index}
                                {(member.missed_payments_count || 0) > 0 && (
                                  <span className="text-destructive font-medium ml-2">
                                    • {member.missed_payments_count} missed
                                  </span>
                                )}
                              </p>
                              {(member.balance_deficit || 0) > 0 && (
                                <p className="text-xs text-destructive font-medium">
                                  Outstanding: KES {(member.balance_deficit || 0).toLocaleString()}
                                </p>
                              )}
                              {paidOutMemberIds.has(member.id) ? (
                                <p className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Payout received
                                </p>
                              ) : member.id === currentTurnMemberId ? (
                                <p className="text-xs text-primary font-medium">
                                  Receiving payout this cycle
                                </p>
                              ) : nextTurnDates[member.id] ? (
                                <p className="text-xs text-muted-foreground">
                                  Next turn: {formatDate(nextTurnDates[member.id])}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {isActive && isPaidKnown && (
                            <div>
                              {hasPaid ? (
                                <Badge variant="default" className="bg-green-600 gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Paid
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Unpaid
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                  </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {isMember && (
              <TabsContent value="chat">
                <ChamaChatPanel chamaId={chama.id} isManager={isManager} />
              </TabsContent>
            )}

            <TabsContent value="documents">
              <GroupDocuments
                entityType="chama"
                entityId={chama.id}
                canUpload={isManager}
              />
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
        {!hasViewAccess && !isPending && !isRemovedMember && (
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
