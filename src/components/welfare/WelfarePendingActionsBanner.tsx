import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { BellRing, CheckCircle, XCircle, Loader2, Clock, Wallet } from "lucide-react";
import { usePinVerification } from "@/hooks/usePinVerification";
import { PinEntryDialog } from "@/components/PinEntryDialog";

interface Props {
  welfareId: string;
  welfare?: any;
  myRole?: string | null;
  onAction: () => void;
}

export const WelfarePendingActionsBanner = ({ welfareId, welfare, myRole, onAction }: Props) => {
  const { user } = useAuth();
  const { showPin, requirePin, onVerified, onOpenChange: onPinDialogChange } = usePinVerification();
  const [approvals, setApprovals] = useState<any[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingFee, setSubmittingFee] = useState(false);

  const isExecutive = myRole === 'chairman' || myRole === 'secretary' || myRole === 'treasurer';

  const fetchData = useCallback(async () => {
    if (!isExecutive) return;
    try {
      const [approvalsRes, withdrawalsRes] = await Promise.allSettled([
        (async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return [];
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const response = await fetch(
            `${supabaseUrl}/functions/v1/welfare-withdrawal-approve?welfare_id=${welfareId}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
            }
          );
          const result = await response.json();
          return result?.data || [];
        })(),
        supabase
          .from('withdrawals')
          .select('id, amount, requested_at, requested_by, status')
          .eq('welfare_id', welfareId)
          .eq('status', 'pending_approval')
          .order('requested_at', { ascending: false })
          .limit(10),
      ]);

      setApprovals(approvalsRes.status === 'fulfilled' ? (approvalsRes.value as any[]) : []);
      setPendingWithdrawals(
        withdrawalsRes.status === 'fulfilled' ? ((withdrawalsRes.value as any)?.data || []) : []
      );
    } catch {
      // silent — banner is non-critical
    }
  }, [welfareId, isExecutive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const decide = (approvalId: string, decision: 'approved' | 'rejected') => {
    requirePin(async () => {
      setProcessingId(approvalId);
      try {
        const { data, error } = await supabase.functions.invoke('welfare-withdrawal-approve', {
          method: 'POST',
          body: {
            approval_id: approvalId,
            decision,
            rejection_reason: decision === 'rejected' ? rejectionReason || undefined : undefined,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success(data?.message || `Withdrawal ${decision}`);
        setRejectionReason("");
        setRejectingId(null);
        fetchData();
        onAction();
      } catch (e: any) {
        toast.error(e.message || "Failed to process request");
      } finally {
        setProcessingId(null);
      }
    });
  };

  const approveFeeChange = () => {
    requirePin(async () => {
      setSubmittingFee(true);
      try {
        const { data, error } = await supabase.functions.invoke(`welfare-crud/${welfareId}`, {
          method: 'PUT',
          body: { approve_registration_fee: true },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success('Registration fee updated');
        onAction();
      } catch (e: any) {
        toast.error(e.message || 'Failed to approve change');
      } finally {
        setSubmittingFee(false);
      }
    });
  };

  if (!isExecutive) return null;

  const pendingFee = welfare?.registration_fee_pending;
  const feeRequester = welfare?.registration_fee_change_requested_by;
  const feeIsMine = pendingFee != null && feeRequester && feeRequester === user?.id;
  const showFeeApprove = pendingFee != null && !feeIsMine;

  // Withdrawals still awaiting other executives (I already acted or I requested)
  const actionableIds = new Set(approvals.map((a: any) => a.withdrawal_id || a.withdrawals?.id));
  const waitingOnOthers = pendingWithdrawals.filter((w: any) => !actionableIds.has(w.id));

  const hasAnything =
    approvals.length > 0 || showFeeApprove || feeIsMine || waitingOnOthers.length > 0;

  if (!hasAnything) return null;

  return (
    <Card className="mb-4 border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
            Executive actions needed
          </p>
          <Badge variant="outline" className="capitalize text-xs">{myRole}</Badge>
        </div>

        {/* Withdrawal approvals awaiting me */}
        {approvals.map((approval: any) => (
          <div
            key={approval.id}
            className="p-3 rounded-lg border bg-background space-y-2"
          >
            <div className="flex justify-between items-start gap-2 flex-wrap">
              <div>
                <p className="font-bold">
                  Withdrawal of KES {Number(approval.withdrawals?.amount || 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Requested by {approval.withdrawals?.profiles?.full_name || 'an executive'}
                </p>
                {approval.withdrawals?.notes && (
                  <p className="text-xs text-muted-foreground">{approval.withdrawals.notes}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" /> Awaiting you
              </Badge>
            </div>

            {rejectingId === approval.id && (
              <Textarea
                placeholder="Reason for rejection (optional)"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                onClick={() => decide(approval.id, 'approved')}
                disabled={!!processingId}
              >
                {processingId === approval.id ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="h-3 w-3 mr-1" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  rejectingId === approval.id
                    ? decide(approval.id, 'rejected')
                    : setRejectingId(approval.id)
                }
                disabled={!!processingId}
              >
                {processingId === approval.id ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                {rejectingId === approval.id ? 'Confirm reject' : 'Reject'}
              </Button>
            </div>
          </div>
        ))}

        {/* Registration fee change awaiting my approval */}
        {showFeeApprove && (
          <div className="p-3 rounded-lg border bg-background space-y-2">
            <div className="flex justify-between items-start gap-2 flex-wrap">
              <div>
                <p className="font-bold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  Registration fee change
                </p>
                <p className="text-xs text-muted-foreground">
                  KES {Number(welfare?.registration_fee || 0).toLocaleString()} → KES{' '}
                  {Number(pendingFee).toLocaleString()}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" /> Awaiting you
              </Badge>
            </div>
            <Button size="sm" onClick={approveFeeChange} disabled={submittingFee} className="w-full">
              {submittingFee ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <CheckCircle className="h-3 w-3 mr-1" />
              )}
              Approve change to KES {Number(pendingFee).toLocaleString()}
            </Button>
          </div>
        )}

        {/* Read-only: waiting on other executives */}
        {feeIsMine && (
          <p className="text-xs text-muted-foreground">
            Your registration fee change to KES {Number(pendingFee).toLocaleString()} is waiting for
            another executive to approve.
          </p>
        )}
        {waitingOnOthers.map((w: any) => (
          <p key={w.id} className="text-xs text-muted-foreground">
            Withdrawal of KES {Number(w.amount).toLocaleString()} is waiting for the other
            executives to approve.
          </p>
        ))}
      </CardContent>

      <PinEntryDialog
        open={showPin}
        onOpenChange={onPinDialogChange}
        onVerified={onVerified}
        title="Confirm with PIN"
        description="Enter your 5-digit PIN to approve or reject this request."
      />
    </Card>
  );
};
