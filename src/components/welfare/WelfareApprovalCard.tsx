import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, Clock } from "lucide-react";

interface Props {
  welfareId: string;
  onDecision: () => void;
}

export const WelfareApprovalCard = ({ welfareId, onDecision }: Props) => {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    fetchApprovals();
  }, [welfareId]);

  const fetchApprovals = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

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
      if (result?.data) setApprovals(result.data);
    } catch (e) {
      console.error('Error fetching approvals:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (approvalId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(approvalId);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-withdrawal-approve', {
        method: 'POST',
        body: { approval_id: approvalId, decision, rejection_reason: decision === 'rejected' ? rejectionReason : undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.message || `Withdrawal ${decision}`);
      setRejectionReason("");
      fetchApprovals();
      onDecision();
    } catch (error: any) {
      toast.error(error.message || "Failed to process");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <Card><CardContent className="py-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

  if (approvals.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Pending Approvals</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No pending approvals</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Pending Approvals ({approvals.length})</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {approvals.map((approval: any) => (
          <div key={approval.id} className="p-4 border rounded-lg space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">KES {Number(approval.withdrawals?.amount || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">By: {approval.withdrawals?.profiles?.full_name}</p>
                <p className="text-xs text-muted-foreground">{approval.withdrawals?.notes}</p>
              </div>
              <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
            </div>
            <Textarea
              placeholder="Rejection reason (optional)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={1}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleDecision(approval.id, 'approved')} disabled={!!processingId} className="flex-1">
                {processingId === approval.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDecision(approval.id, 'rejected')} disabled={!!processingId} className="flex-1">
                {processingId === approval.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
