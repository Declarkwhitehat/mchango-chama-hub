import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Wallet, Clock, CheckCircle, XCircle, Loader2, ArrowRightLeft,
  Send, Banknote, RefreshCw, ShieldCheck, Phone, AlertTriangle, Users
} from "lucide-react";
import { WithdrawalMemberAnalytics } from "./WithdrawalMemberAnalytics";

interface MemberAnalytics {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  missed_payments_count: number;
  late_payments_count: number;
  on_time_payments_count: number;
  on_time_rate: number;
  total_contributed: number;
  expected_contributions: number;
  balance_deficit: number;
  balance_credit: number;
  skip_history: any[];
  payout_position: number;
  risk_level: 'low' | 'medium' | 'high';
  first_payment_completed: boolean;
  joined_at: string;
}

interface NextEligibleMember {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  on_time_rate: number;
  risk_level: 'low' | 'medium' | 'high';
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

export const WithdrawalsManagement = () => {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLock, setProcessingLock] = useState<Set<string>>(new Set());
  const [paymentReference, setPaymentReference] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [skipToNext, setSkipToNext] = useState(true);
  const [memberAnalytics, setMemberAnalytics] = useState<MemberAnalytics | null>(null);
  const [nextEligible, setNextEligible] = useState<NextEligibleMember | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    loadWithdrawals();
    const channel = supabase
      .channel('admin-withdrawals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'withdrawals' }, () => loadWithdrawals())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'withdrawals' }, () => loadWithdrawals())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadWithdrawals = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('withdrawals-crud', { method: 'GET' });
      if (error) throw error;
      setWithdrawals(data.data || []);
    } catch (error: any) {
      console.error("Error loading withdrawals:", error);
      toast({ title: "Error", description: "Failed to load withdrawals", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = { all: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const w of withdrawals) {
      counts.all++;
      if (['pending', 'pending_approval'].includes(w.status)) counts.pending++;
      else if (['approved', 'processing'].includes(w.status)) counts.processing++;
      else if (w.status === 'completed') counts.completed++;
      else if (['failed', 'pending_retry', 'rejected'].includes(w.status)) counts.failed++;
    }
    return counts;
  }, [withdrawals]);

  const filteredWithdrawals = useMemo(() => {
    if (statusFilter === 'all') return withdrawals;
    const map: Record<StatusFilter, string[]> = {
      all: [],
      pending: ['pending', 'pending_approval'],
      processing: ['approved', 'processing'],
      completed: ['completed'],
      failed: ['failed', 'pending_retry', 'rejected'],
    };
    return withdrawals.filter(w => map[statusFilter].includes(w.status));
  }, [withdrawals, statusFilter]);

  const closeDialog = () => {
    setSelectedWithdrawal(null);
    setPaymentReference("");
    setRejectionReason("");
    setSkipToNext(true);
    setMemberAnalytics(null);
    setNextEligible(null);
    setActiveTab("details");
  };

  const handleSendViaMpesa = async () => {
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/withdrawals-crud`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ withdrawal_id: selectedWithdrawal.id, status: 'approved' }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Failed to initiate M-Pesa payout');

      toast({ title: "M-Pesa Payout Initiated", description: "Money is being sent to the member's M-Pesa." });
      closeDialog();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to initiate M-Pesa payout", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryMpesa = async () => {
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/withdrawals-crud`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ withdrawal_id: selectedWithdrawal.id, action: 'retry' }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Retry failed');

      toast({ title: "Retry Initiated", description: "M-Pesa payout retry has been triggered." });
      closeDialog();
    } catch (error: any) {
      toast({ title: "Retry Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForceApprove = async () => {
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/withdrawals-crud`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ withdrawal_id: selectedWithdrawal.id, action: 'force_approve' }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Force approve failed');

      toast({ title: "Force Approved", description: "Welfare withdrawal has been force-approved." });
      closeDialog();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkAsManuallyPaid = async () => {
    if (!paymentReference) {
      toast({ title: "Error", description: "Please enter the payment reference", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('withdrawals-crud', {
        method: 'PATCH',
        body: { withdrawal_id: selectedWithdrawal.id, status: 'completed', payment_reference: paymentReference },
      });
      if (error) throw error;
      toast({ title: "Withdrawal Completed", description: "Withdrawal marked as manually paid" });
      closeDialog();
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to complete withdrawal", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason) {
      toast({ title: "Error", description: "Please enter rejection reason", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdrawals-crud', {
        method: 'PATCH',
        body: {
          withdrawal_id: selectedWithdrawal.id,
          status: 'rejected',
          rejection_reason: rejectionReason,
          skip_to_next: skipToNext && selectedWithdrawal.chama_id,
        },
      });
      if (error) throw error;
      toast({
        title: "Withdrawal Rejected",
        description: data?.swapped ? "Positions swapped and next eligible member will receive payout." : "Withdrawal rejected",
      });
      closeDialog();
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to reject withdrawal", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadMemberAnalytics = async (withdrawal: any) => {
    if (!withdrawal.chama_id) return;
    setIsLoadingAnalytics(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/withdrawal-member-analytics?chama_id=${withdrawal.chama_id}&withdrawal_id=${withdrawal.id}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        const result = await response.json();
        setMemberAnalytics(result.member_analytics);
        setNextEligible(result.next_eligible_member);
      }
    } catch (error) {
      console.error('Error loading member analytics:', error);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const handleSelectWithdrawal = (withdrawal: any) => {
    setSelectedWithdrawal(withdrawal);
    setActiveTab("details");
    setPaymentReference("");
    setRejectionReason("");
    setSkipToNext(true);
    setMemberAnalytics(null);
    setNextEligible(null);
    if (withdrawal.chama_id) loadMemberAnalytics(withdrawal);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case 'pending_approval':
        return <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"><Users className="h-3 w-3" />Awaiting Approval</Badge>;
      case 'approved':
        return <Badge className="gap-1 bg-primary text-primary-foreground"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
      case 'processing':
        return <Badge className="gap-1 bg-primary text-primary-foreground"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
      case 'completed':
        return <Badge className="gap-1 bg-accent text-accent-foreground"><CheckCircle className="h-3 w-3" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
      case 'pending_retry':
        return <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"><RefreshCw className="h-3 w-3" />Pending Retry</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const canReview = (status: string) =>
    ['pending', 'pending_approval', 'pending_retry', 'approved', 'processing', 'failed'].includes(status);

  const extractRecipientPhone = (notes: string | null): string | null => {
    if (!notes) return null;
    const match = notes.match(/Recipient:\s*([\d+]+)/);
    return match?.[1] || null;
  };

  const isMpesaPayment = selectedWithdrawal?.payment_method?.method_type === 'mpesa';
  const isRetryable = selectedWithdrawal && ['failed', 'pending_retry'].includes(selectedWithdrawal.status);
  const isPendingApproval = selectedWithdrawal?.status === 'pending_approval';

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {([
          { key: 'all' as StatusFilter, label: 'All', icon: Wallet, color: '' },
          { key: 'pending' as StatusFilter, label: 'Pending', icon: Clock, color: 'text-amber-600' },
          { key: 'processing' as StatusFilter, label: 'Processing', icon: Loader2, color: 'text-primary' },
          { key: 'completed' as StatusFilter, label: 'Completed', icon: CheckCircle, color: 'text-green-600' },
          { key: 'failed' as StatusFilter, label: 'Failed/Rejected', icon: XCircle, color: 'text-destructive' },
        ]).map(({ key, label, icon: Icon, color }) => (
          <Card
            key={key}
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === key ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter(key)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-2xl font-bold">{statusCounts[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Withdrawal Requests
          </CardTitle>
          <CardDescription>Review and process withdrawal requests across all entities</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Net Amount</TableHead>
                <TableHead>M-Pesa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWithdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No withdrawal requests in this category
                  </TableCell>
                </TableRow>
              ) : (
                filteredWithdrawals.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell className="whitespace-nowrap">
                      <div>{new Date(withdrawal.requested_at).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground">{new Date(withdrawal.requested_at).toLocaleTimeString()}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{withdrawal.requester?.full_name || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{withdrawal.requester?.phone || ''}</div>
                      {withdrawal.welfare_id && extractRecipientPhone(withdrawal.notes) && (
                        <div className="text-xs text-primary font-medium mt-0.5">
                          → Recipient: {extractRecipientPhone(withdrawal.notes)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-muted-foreground">{withdrawal.entity_type}</div>
                      <div className="font-medium text-sm">{withdrawal.entity_name || '—'}</div>
                    </TableCell>
                    <TableCell className="font-medium">KES {Number(withdrawal.amount).toLocaleString()}</TableCell>
                    <TableCell className="font-semibold text-primary">KES {Number(withdrawal.net_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      {withdrawal.payment_method?.phone_number ? (
                        <span className="text-xs font-mono">{withdrawal.payment_method.phone_number}</span>
                      ) : extractRecipientPhone(withdrawal.notes) ? (
                        <span className="text-xs font-mono">{extractRecipientPhone(withdrawal.notes)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(withdrawal.status)}
                        {withdrawal.status === 'pending_approval' && withdrawal.welfare_approvals?.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-xs text-muted-foreground cursor-help">
                                {withdrawal.welfare_approvals.filter((a: any) => a.decision === 'approved').length}/{withdrawal.welfare_approvals.length} approved
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {withdrawal.welfare_approvals.map((a: any, i: number) => (
                                <div key={i} className="text-xs">
                                  {a.approver_role}: {a.decision === 'approved' ? '✓' : a.decision === 'rejected' ? '✗' : '⏳'} {a.decision}
                                </div>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canReview(withdrawal.status) && (
                        <Button size="sm" onClick={() => handleSelectWithdrawal(withdrawal)}>
                          Review
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Withdrawal Request</DialogTitle>
            <DialogDescription>
              {selectedWithdrawal?.entity_type}: {selectedWithdrawal?.entity_name || 'Unknown'}
            </DialogDescription>
          </DialogHeader>

          {selectedWithdrawal && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Withdrawal Details</TabsTrigger>
                <TabsTrigger value="analytics" disabled={!selectedWithdrawal.chama_id}>Payment Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Requester</Label>
                    <p className="font-medium">{selectedWithdrawal.requester?.full_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedWithdrawal.requester?.phone}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Source</Label>
                    <p className="text-xs text-muted-foreground">{selectedWithdrawal.entity_type}</p>
                    <p className="font-medium">{selectedWithdrawal.entity_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Amount</Label>
                    <p className="text-xl font-bold">KES {Number(selectedWithdrawal.amount).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Net Payment</Label>
                    <p className="text-xl font-bold text-primary">KES {Number(selectedWithdrawal.net_amount).toLocaleString()}</p>
                  </div>
                </div>

                {/* M-Pesa Number */}
                {selectedWithdrawal.payment_method?.phone_number && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <Phone className="h-4 w-4 text-primary" />
                    <div>
                      <Label className="text-muted-foreground text-xs">M-Pesa Number</Label>
                      <p className="font-mono font-bold text-lg">{selectedWithdrawal.payment_method.phone_number}</p>
                    </div>
                  </div>
                )}

                {/* Recipient Phone (Welfare) */}
                {selectedWithdrawal.welfare_id && extractRecipientPhone(selectedWithdrawal.notes) && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-primary/20">
                    <Phone className="h-4 w-4 text-primary" />
                    <div>
                      <Label className="text-muted-foreground text-xs">Recipient M-Pesa Number</Label>
                      <p className="font-mono font-bold text-lg">{extractRecipientPhone(selectedWithdrawal.notes)}</p>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                {selectedWithdrawal.payment_method && !selectedWithdrawal.payment_method.phone_number && (
                  <div className="p-3 bg-muted rounded-lg">
                    <Label className="text-muted-foreground">Payment Method</Label>
                    <p className="font-medium capitalize">
                      {selectedWithdrawal.payment_method.method_type?.replace('_', ' ')}
                      {selectedWithdrawal.payment_method.bank_name && ` — ${selectedWithdrawal.payment_method.bank_name}`}
                      {selectedWithdrawal.payment_method.account_number && ` (${selectedWithdrawal.payment_method.account_number})`}
                    </p>
                  </div>
                )}

                {/* Welfare Approval Status */}
                {isPendingApproval && selectedWithdrawal.welfare_approvals?.length > 0 && (
                  <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 space-y-2">
                    <Label className="text-amber-800 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <Users className="h-4 w-4" /> Welfare Multi-Sig Approval
                    </Label>
                    {selectedWithdrawal.welfare_approvals.map((a: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="capitalize font-medium">{a.approver_role}</span>
                        <span className={a.decision === 'approved' ? 'text-green-600' : a.decision === 'rejected' ? 'text-destructive' : 'text-muted-foreground'}>
                          {a.decision === 'approved' ? '✓ Approved' : a.decision === 'rejected' ? `✗ Rejected${a.rejection_reason ? ': ' + a.rejection_reason : ''}` : '⏳ Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedWithdrawal.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="text-sm mt-1 p-2 bg-muted rounded whitespace-pre-line">{selectedWithdrawal.notes}</p>
                  </div>
                )}

                {selectedWithdrawal.b2c_error_details && (
                  <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <Label className="text-destructive font-semibold">B2C Error Details</Label>
                    <p className="text-xs mt-1 font-mono whitespace-pre-wrap text-destructive/80">
                      {typeof selectedWithdrawal.b2c_error_details === 'string'
                        ? selectedWithdrawal.b2c_error_details
                        : JSON.stringify(selectedWithdrawal.b2c_error_details, null, 2)}
                    </p>
                  </div>
                )}

                {/* Action Sections */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold">Actions</h4>

                  {/* Retry Button for failed/pending_retry */}
                  {isRetryable && isMpesaPayment && (
                    <Button onClick={handleRetryMpesa} disabled={isProcessing} className="w-full" variant="default">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-2" />Retry M-Pesa Payout</>}
                    </Button>
                  )}

                  {/* Force Approve for welfare pending_approval */}
                  {isPendingApproval && (
                    <Button onClick={handleForceApprove} disabled={isProcessing} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="h-4 w-4 mr-2" />Force Approve (Admin Override)</>}
                    </Button>
                  )}

                  {/* Send via M-Pesa for pending */}
                  {['pending', 'pending_approval'].includes(selectedWithdrawal.status) && isMpesaPayment && !isPendingApproval && (
                    <Button onClick={handleSendViaMpesa} disabled={isProcessing} className="w-full">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" />Send via M-Pesa</>}
                    </Button>
                  )}

                  {/* Manual Payment */}
                  {!['completed', 'rejected'].includes(selectedWithdrawal.status) && (
                    <div className="space-y-2">
                      <Label htmlFor="payment-ref">{isMpesaPayment ? 'Or mark as manually paid:' : 'Payment Reference'}</Label>
                      <div className="flex gap-2">
                        <Input
                          id="payment-ref"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Enter payment reference (Bank Ref, Check #, etc.)"
                          className="flex-1"
                        />
                        <Button onClick={handleMarkAsManuallyPaid} disabled={isProcessing || !paymentReference} variant="outline">
                          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Banknote className="h-4 w-4 mr-2" />Mark Paid</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rejection Section */}
                {!['completed', 'rejected'].includes(selectedWithdrawal.status) && (
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="font-semibold text-destructive">Reject Withdrawal</h4>
                    <div className="space-y-2">
                      <Label htmlFor="rejection">Rejection Reason</Label>
                      <Textarea
                        id="rejection"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Enter reason for rejection..."
                        rows={2}
                      />
                    </div>

                    {selectedWithdrawal.chama_id && (
                      <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                        <Checkbox id="skip-to-next" checked={skipToNext} onCheckedChange={(checked) => setSkipToNext(checked as boolean)} />
                        <div className="grid gap-1.5 leading-none">
                          <label htmlFor="skip-to-next" className="text-sm font-medium leading-none flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />Swap positions & pay next eligible member
                          </label>
                          <p className="text-xs text-muted-foreground">The rejected member will be moved down</p>
                        </div>
                      </div>
                    )}

                    <Button variant="destructive" onClick={handleReject} disabled={isProcessing || !rejectionReason} className="w-full">
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-2" />{skipToNext && selectedWithdrawal.chama_id ? 'Reject & Skip to Next' : 'Reject'}</>}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="analytics" className="mt-4">
                <WithdrawalMemberAnalytics analytics={memberAnalytics} nextEligible={nextEligible} isLoading={isLoadingAnalytics} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
