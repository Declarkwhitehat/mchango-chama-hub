import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, AlertTriangle, Users, Loader2, Send } from "lucide-react";
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
  chama: { id: string; name: string; contribution_amount: number; group_code: string } | null;
  cycle: { cycle_number: number; start_date: string; end_date: string } | null;
  scheduled_member: { id: string; member_code: string; profiles: { full_name: string } | null } | null;
  chosen_member_detail: { id: string; member_code: string; profiles: { full_name: string } | null } | null;
  reviewer: { full_name: string } | null;
}

interface EligibleMember {
  id: string;
  member_code: string;
  order_index: number;
  is_eligible: boolean;
  unpaid_cycles: number;
  has_debts: boolean;
  profiles: { full_name: string } | null;
}

export default function AdminPayoutApprovals() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [eligibleMembers, setEligibleMembers] = useState<EligibleMember[]>([]);
  const [chosenMemberId, setChosenMemberId] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

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
    setLoadingMembers(true);

    try {
      const { data, error } = await supabase.functions.invoke('payout-approval', {
        body: { action: 'get-eligible-members', chamaId: request.chama_id },
      });

      if (error) throw error;
      setEligibleMembers(data.members || []);
    } catch (err: any) {
      toast.error("Failed to load members: " + err.message);
    } finally {
      setLoadingMembers(false);
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

  const pendingCount = requests.filter(r => r.status === 'pending').length;

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
                        Cycle #{req.cycle?.cycle_number} · {format(new Date(req.created_at), 'MMM d, yyyy HH:mm')}
                      </CardDescription>
                    </div>
                    {statusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Payout Amount</span>
                      <p className="font-semibold">KES {req.payout_amount?.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Scheduled For</span>
                      <p className="font-semibold">{req.scheduled_member?.profiles?.full_name || req.scheduled_member?.member_code || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ineligible Members</span>
                      <p className="font-semibold flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        {(req.ineligible_members as any[])?.length || 0}
                      </p>
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approve Payout — {selectedRequest?.chama?.name}</DialogTitle>
            <DialogDescription>
              Select a member to receive KES {selectedRequest?.payout_amount?.toFixed(2)} for Cycle #{selectedRequest?.cycle?.cycle_number}
            </DialogDescription>
          </DialogHeader>

          {loadingMembers ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <>
              <div className="rounded-md border max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligibleMembers.map(m => (
                      <TableRow
                        key={m.id}
                        className={`cursor-pointer ${chosenMemberId === m.id ? 'bg-primary/10' : ''} ${!m.is_eligible ? 'opacity-50' : ''}`}
                        onClick={() => setChosenMemberId(m.id)}
                      >
                        <TableCell>
                          <input type="radio" checked={chosenMemberId === m.id} onChange={() => setChosenMemberId(m.id)} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{m.profiles?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{m.member_code}</p>
                          </div>
                        </TableCell>
                        <TableCell>#{m.order_index}</TableCell>
                        <TableCell>
                          {m.is_eligible ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600">Eligible</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600">
                              {m.has_debts ? 'Has Debts' : `${m.unpaid_cycles} Unpaid`}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Notes (optional)</label>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Reason for choosing this member..."
                  rows={2}
                />
              </div>
            </>
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
