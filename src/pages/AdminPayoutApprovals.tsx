import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, Clock, AlertTriangle, Users, Loader2, Send,
  ChevronDown, History, ShieldAlert, Phone, CreditCard, Info
} from "lucide-react";
import { format } from "date-fns";

interface ApprovalRequest {
  id: string;
  chama_id: string;
  cycle_id: string;
  payout_amount: number;
  reason: string;
  ineligible_members: any[];
  status: string;
  admin_notes: string | null;
  b2c_triggered: boolean;
  created_at: string;
  reviewed_at: string | null;
  chama: { id: string; name: string; contribution_amount: number; group_code: string; available_balance: number; max_members: number; current_cycle_round: number } | null;
  cycle: { cycle_number: number; start_date: string; end_date: string } | null;
  scheduled_member: { id: string; member_code: string; profiles: { full_name: string; phone: string } | null } | null;
  chosen_member_detail: { id: string; member_code: string; profiles: { full_name: string } | null } | null;
  reviewer: { full_name: string } | null;
}

interface EnrichedMember {
  id: string;
  member_code: string;
  order_index: number;
  is_eligible: boolean;
  unpaid_cycles: number;
  has_debts: boolean;
  payouts_received: number;
  total_received_amount: number;
  already_received_this_round: boolean;
  missed_payments_count: number;
  carry_forward_credit: number;
  was_skipped: boolean;
  trust_score: number | null;
  success_rate: number;
  profiles: { full_name: string; phone: string } | null;
}

interface ChamaSummary {
  name: string;
  group_code: string;
  contribution_amount: number;
  available_balance: number;
  total_members: number;
  total_cycles_completed: number;
  current_round: number;
  all_received_this_round: boolean;
}

interface PayoutHistoryEntry {
  cycle_number: number;
  beneficiary_name: string;
  payout_amount: number;
  date: string;
}

export default function AdminPayoutApprovals() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [enrichedMembers, setEnrichedMembers] = useState<EnrichedMember[]>([]);
  const [chamaSummary, setChamaSummary] = useState<ChamaSummary | null>(null);
  const [payoutHistory, setPayoutHistory] = useState<PayoutHistoryEntry[]>([]);
  const [chosenMemberId, setChosenMemberId] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memberProfile, setMemberProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('payout-approval', {
        body: { action: 'list', status: filter || undefined },
      });
      if (error) throw error;
      setRequests(data.requests || []);
    } catch (err: any) {
      toast.error("Failed to load requests: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openApproveDialog = async (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setChosenMemberId("");
    setAdminNotes("");
    setHistoryOpen(false);
    setMemberProfile(null);
    setLoadingMembers(true);

    try {
      const { data, error } = await supabase.functions.invoke('payout-approval', {
        body: { action: 'get-eligible-members', chamaId: request.chama_id },
      });
      if (error) throw error;

      const members = (data.members || []) as EnrichedMember[];
      // Sort: eligible first, then by order_index
      members.sort((a: EnrichedMember, b: EnrichedMember) => {
        if (a.already_received_this_round !== b.already_received_this_round) return a.already_received_this_round ? 1 : -1;
        if (a.is_eligible !== b.is_eligible) return a.is_eligible ? -1 : 1;
        return (a.order_index || 0) - (b.order_index || 0);
      });

      setEnrichedMembers(members);
      setChamaSummary(data.chama_summary || null);
      setPayoutHistory(data.payout_history || []);
    } catch (err: any) {
      toast.error("Failed to load members: " + err.message);
    } finally {
      setLoadingMembers(false);
    }
  };

  const selectMember = async (memberId: string) => {
    setChosenMemberId(memberId);
    setMemberProfile(null);
    
    // Find the member's user_id from enrichedMembers
    const member = enrichedMembers.find(m => m.id === memberId);
    const userId = (member as any)?.user_id;
    if (!userId) return;

    setLoadingProfile(true);
    try {
      const { data, error } = await supabase.functions.invoke('payout-approval', {
        body: { action: 'get-member-profile', userId },
      });
      if (error) throw error;
      setMemberProfile(data);
    } catch (err: any) {
      console.error('Failed to load member profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest || !chosenMemberId) {
      toast.error("Please select a member to receive the payout");
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('payout-approval', {
        body: {
          action: 'approve',
          requestId: selectedRequest.id,
          chosenMemberId,
          adminNotes,
          adminUserId: user?.id,
        },
      });
      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success(
        `Payout approved! KES ${data.payout_amount?.toFixed(2)} → ${data.chosen_member}. ${data.b2c_triggered ? 'B2C initiated.' : 'Manual processing needed.'}`
      );
      setSelectedRequest(null);
      fetchRequests();
    } catch (err: any) {
      toast.error("Approval failed: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (requestId: string) => {
    const notes = prompt("Rejection reason:");
    if (!notes) return;

    try {
      const { error } = await supabase.functions.invoke('payout-approval', {
        body: { action: 'reject', requestId, adminNotes: notes, adminUserId: user?.id },
      });
      if (error) throw error;
      toast.success("Request rejected");
      fetchRequests();
    } catch (err: any) {
      toast.error("Rejection failed: " + err.message);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getIneligibleReason = (m: any) => {
    const reasons: string[] = [];
    if (m.reason) return m.reason;
    if (m.has_debts) reasons.push('Outstanding debts');
    if (m.unpaid_cycles > 0) reasons.push(`${m.unpaid_cycles} unpaid cycles`);
    if (m.missed_payments > 0) reasons.push(`${m.missed_payments} missed`);
    return reasons.join(', ') || 'Ineligible';
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const selectedMember = enrichedMembers.find(m => m.id === chosenMemberId);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Payout Approvals</h1>
            <p className="text-muted-foreground">Review and approve payouts when no eligible beneficiary was found automatically</p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-lg px-4 py-1">
              {pendingCount} Pending
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', ''].map(s => (
            <Button
              key={s || 'all'}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s || 'All'}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : requests.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No payout approval requests found</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {requests.map(req => (
              <Card key={req.id} className={req.status === 'pending' ? 'border-amber-300 dark:border-amber-700' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{req.chama?.name || 'Unknown Chama'}</CardTitle>
                      <CardDescription>
                        {req.chama?.group_code && <span className="font-mono mr-2">{req.chama.group_code}</span>}
                        Cycle #{req.cycle?.cycle_number} · {format(new Date(req.created_at), 'MMM d, yyyy HH:mm')}
                        {req.cycle && (
                          <span className="ml-2 text-xs">
                            ({format(new Date(req.cycle.start_date), 'MMM d')} – {format(new Date(req.cycle.end_date), 'MMM d')})
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    {statusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Payout Amount</span>
                      <p className="font-semibold">KES {req.payout_amount?.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Contribution</span>
                      <p className="font-semibold">KES {req.chama?.contribution_amount?.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Balance</span>
                      <p className="font-semibold">KES {req.chama?.available_balance?.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Scheduled For</span>
                      <p className="font-semibold">{req.scheduled_member?.profiles?.full_name || req.scheduled_member?.member_code || '-'}</p>
                      {req.scheduled_member?.profiles?.phone && (
                        <p className="text-xs text-muted-foreground font-mono">{req.scheduled_member.profiles.phone}</p>
                      )}
                    </div>
                    {req.chosen_member_detail && (
                      <div>
                        <span className="text-muted-foreground">Approved For</span>
                        <p className="font-semibold text-emerald-600">
                          {req.chosen_member_detail?.profiles?.full_name || req.chosen_member_detail?.member_code}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Ineligible members expanded */}
                  {(req.ineligible_members as any[])?.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-amber-600 p-0 h-auto">
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          {(req.ineligible_members as any[]).length} Ineligible Members
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
                          {(req.ineligible_members as any[]).map((m: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span>{m.name || m.member_code}</span>
                              <span className="text-muted-foreground">{getIneligibleReason(m)}</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  <p className="text-sm text-muted-foreground">{req.reason}</p>

                  {req.admin_notes && (
                    <p className="text-sm bg-muted/50 p-2 rounded">
                      <strong>Admin:</strong> {req.admin_notes}
                    </p>
                  )}

                  {req.b2c_triggered && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">
                      <Send className="h-3 w-3 mr-1" /> B2C Payout Triggered
                    </Badge>
                  )}

                  {req.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <Button onClick={() => openApproveDialog(req)} size="sm">
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve & Assign
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleReject(req.id)}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approve Payout — {selectedRequest?.chama?.name}</DialogTitle>
            <DialogDescription>
              Select a member to receive KES {selectedRequest?.payout_amount?.toFixed(2)} for Cycle #{selectedRequest?.cycle?.cycle_number}
            </DialogDescription>
          </DialogHeader>

          {loadingMembers ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {/* Chama Summary */}
              {chamaSummary && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-3">
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Group Code</span>
                        <p className="font-mono font-semibold">{chamaSummary.group_code}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Members</span>
                        <p className="font-semibold">{chamaSummary.total_members}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Contribution</span>
                        <p className="font-semibold">KES {chamaSummary.contribution_amount}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Balance</span>
                        <p className="font-semibold">KES {chamaSummary.available_balance?.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Cycles Done</span>
                        <p className="font-semibold">{chamaSummary.total_cycles_completed}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Current Round</span>
                        <p className="font-semibold">#{chamaSummary.current_round}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payout History */}
              {payoutHistory.length > 0 && (
                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      <span className="flex items-center gap-1"><History className="h-4 w-4" /> Payout History ({payoutHistory.length} payouts)</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-md border max-h-40 overflow-y-auto mt-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Cycle</TableHead>
                            <TableHead className="text-xs">Beneficiary</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payoutHistory.map((ph, i) => (
                            <TableRow key={i} className="text-xs">
                              <TableCell>#{ph.cycle_number}</TableCell>
                              <TableCell>{ph.beneficiary_name}</TableCell>
                              <TableCell>KES {ph.payout_amount?.toFixed(2)}</TableCell>
                              <TableCell>{ph.date ? format(new Date(ph.date), 'MMM d') : '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Member Selection Table */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Users className="h-4 w-4" /> Select Beneficiary
                  <span className="text-xs text-muted-foreground ml-2">Click a row to select</span>
                </p>
                <div className="rounded-md border max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs">Pos</TableHead>
                        <TableHead className="text-xs">Success Rate</TableHead>
                        <TableHead className="text-xs">Payouts</TableHead>
                        <TableHead className="text-xs">Missed</TableHead>
                        <TableHead className="text-xs">Credit</TableHead>
                        <TableHead className="text-xs">Trust</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrichedMembers.map(m => {
                        const blocked = m.already_received_this_round;
                        const isSelected = chosenMemberId === m.id;
                        const successRate = m.success_rate ?? 100;
                        const successColor = successRate >= 80 ? 'text-emerald-600' : successRate >= 50 ? 'text-amber-600' : 'text-red-600';
                        return (
                          <TableRow
                            key={m.id}
                            className={`${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'} ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                            onClick={() => !blocked && selectMember(m.id)}
                          >
                            <TableCell>
                              <input
                                type="radio"
                                checked={isSelected}
                                disabled={blocked}
                                onChange={() => !blocked && selectMember(m.id)}
                                className="accent-primary"
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-xs">{m.profiles?.full_name || 'Unknown'}</p>
                                <p className="text-[10px] text-muted-foreground">{m.member_code}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{m.profiles?.phone || '-'}</TableCell>
                            <TableCell className="text-xs font-semibold">#{m.order_index}</TableCell>
                            <TableCell className={`text-xs font-bold ${successColor}`}>
                              {successRate}%
                            </TableCell>
                            <TableCell className="text-xs">{m.payouts_received}</TableCell>
                            <TableCell className="text-xs">
                              {(m.missed_payments_count || 0) > 0 ? (
                                <span className="text-red-600 font-semibold">{m.missed_payments_count}</span>
                              ) : (
                                <span className="text-emerald-600">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {(m.carry_forward_credit || 0) > 0 ? `KES ${m.carry_forward_credit}` : '-'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {m.trust_score !== null ? (
                                <span className={m.trust_score >= 70 ? 'text-emerald-600' : m.trust_score >= 40 ? 'text-amber-600' : 'text-red-600'}>
                                  {m.trust_score}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {blocked ? (
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200">
                                  <ShieldAlert className="h-2.5 w-2.5 mr-0.5" /> Already Received
                                </Badge>
                              ) : m.is_eligible ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                  ✓ Eligible
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-200">
                                  ⚠ {m.has_debts ? 'Debts' : `${m.unpaid_cycles} Unpaid`}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Warning if ineligible member selected */}
                {chosenMemberId && (() => {
                  const chosen = enrichedMembers.find(m => m.id === chosenMemberId);
                  if (chosen && !chosen.is_eligible) {
                    return (
                      <div className="mt-2 p-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/10 text-xs text-amber-800 dark:text-amber-400 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>Warning:</strong> {chosen.profiles?.full_name} has {chosen.has_debts ? 'outstanding debts' : `${chosen.unpaid_cycles} unpaid cycle(s)`}. 
                          Selecting them overrides the eligibility check. Please add a note explaining your reason.
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Selected Member Profile */}
              {chosenMemberId && (
                <div className="border rounded-lg p-3 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-1">
                    <Info className="h-4 w-4" /> Member Profile — {enrichedMembers.find(m => m.id === chosenMemberId)?.profiles?.full_name}
                  </p>

                  {loadingProfile ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : memberProfile ? (
                    <div className="space-y-3 text-xs">
                      {/* Summary badges */}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{memberProfile.summary?.total_chamas || 0} Chamas</Badge>
                        <Badge variant="outline">{memberProfile.summary?.total_welfares || 0} Welfares</Badge>
                        <Badge variant="outline">{memberProfile.summary?.total_campaigns || 0} Campaigns</Badge>
                        <Badge variant="outline">{memberProfile.summary?.manager_roles || 0} Manager Roles</Badge>
                        {memberProfile.summary?.overall_success_rate !== undefined && (
                          <Badge variant="outline" className={memberProfile.summary.overall_success_rate >= 80 ? 'text-emerald-600' : memberProfile.summary.overall_success_rate >= 50 ? 'text-amber-600' : 'text-red-600'}>
                            Overall: {memberProfile.summary.overall_success_rate}% Success
                          </Badge>
                        )}
                        {memberProfile.trust && (
                          <Badge variant="outline" className={memberProfile.trust.trust_score >= 70 ? 'text-emerald-600' : 'text-amber-600'}>
                            Trust: {memberProfile.trust.trust_score}/100
                          </Badge>
                        )}
                      </div>

                      {/* Chama memberships */}
                      {memberProfile.chamas?.length > 0 && (
                        <div>
                          <p className="font-semibold text-xs mb-1">Chama Groups ({memberProfile.chamas.length})</p>
                          <div className="rounded border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px] py-1">Chama</TableHead>
                                  <TableHead className="text-[10px] py-1">Role</TableHead>
                                  <TableHead className="text-[10px] py-1">Status</TableHead>
                                  <TableHead className="text-[10px] py-1">Contributed</TableHead>
                                  <TableHead className="text-[10px] py-1">Success</TableHead>
                                  <TableHead className="text-[10px] py-1">Missed</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {memberProfile.chamas.map((c: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="py-1">
                                      <div>
                                        <span className="font-medium">{c.chama_name}</span>
                                        <span className="text-muted-foreground ml-1 font-mono">({c.group_code})</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-1">
                                      <Badge variant={c.role === 'Manager' ? 'default' : 'secondary'} className="text-[10px]">
                                        {c.role}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="py-1">
                                      <span className={c.chama_status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'}>
                                        {c.chama_status}
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-1 font-mono">KES {c.total_contributed?.toLocaleString()}</TableCell>
                                    <TableCell className={`py-1 font-bold ${c.success_rate >= 80 ? 'text-emerald-600' : c.success_rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                      {c.success_rate}%
                                    </TableCell>
                                    <TableCell className="py-1">
                                      {c.missed_payments > 0 ? (
                                        <span className="text-red-600 font-semibold">{c.missed_payments}</span>
                                      ) : (
                                        <span className="text-emerald-600">0</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {/* Welfare memberships */}
                      {memberProfile.welfares?.length > 0 && (
                        <div>
                          <p className="font-semibold text-xs mb-1">Welfare Groups ({memberProfile.welfares.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {memberProfile.welfares.map((w: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {w.welfare_name} ({w.group_code}) — {w.role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Campaign involvement */}
                      {memberProfile.campaigns?.length > 0 && (
                        <div>
                          <p className="font-semibold text-xs mb-1">Campaigns ({memberProfile.campaigns.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {memberProfile.campaigns.map((c: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                {c.title} ({c.group_code}) — {c.role} · {c.status}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {memberProfile.chamas?.length === 0 && memberProfile.welfares?.length === 0 && memberProfile.campaigns?.length === 0 && (
                        <p className="text-muted-foreground italic">No other group memberships found</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Notes (optional)</label>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Reason for choosing this member..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={!chosenMemberId || processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Approve & Send Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
