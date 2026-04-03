import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Clock, CheckCircle, XCircle, Loader2, ShieldAlert, Timer } from "lucide-react";

interface Props {
  welfareId: string;
  isAdmin?: boolean;
}

interface WithdrawalInfo {
  id: string;
  amount: number;
  net_amount: number;
  status: string;
  notes: string;
  requested_at: string;
  cooling_off_until: string | null;
  requested_by: string;
  profiles: { full_name: string } | null;
  approvals: { approver_role: string; decision: string }[];
}

const CountdownTimer = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("Processing...");
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${hours}h ${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-mono text-lg font-bold">
      <Timer className="h-5 w-5" />
      {timeLeft}
    </div>
  );
};

export const WelfareWithdrawalStatus = ({ welfareId, isAdmin }: Props) => {
  const { user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    fetchWithdrawals();
    const interval = setInterval(fetchWithdrawals, 30000);
    return () => clearInterval(interval);
  }, [welfareId]);

  const fetchWithdrawals = async () => {
    try {
      // Get recent welfare withdrawals (pending_approval, approved with cooling-off, processing)
      const { data, error } = await supabase
        .from('withdrawals')
        .select('id, amount, net_amount, status, notes, requested_at, cooling_off_until, requested_by, profiles:requested_by(full_name)')
        .eq('welfare_id', welfareId)
        .in('status', ['pending_approval', 'approved', 'processing'])
        .order('requested_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Fetch approval statuses for these withdrawals
      const withdrawalIds = (data || []).map(w => w.id);
      let approvalsMap: Record<string, any[]> = {};
      
      if (withdrawalIds.length > 0) {
        const { data: approvals } = await supabase
          .from('welfare_withdrawal_approvals')
          .select('withdrawal_id, approver_role, decision')
          .in('withdrawal_id', withdrawalIds);
        
        for (const a of (approvals || [])) {
          if (!approvalsMap[a.withdrawal_id]) approvalsMap[a.withdrawal_id] = [];
          approvalsMap[a.withdrawal_id].push(a);
        }
      }

      const enriched = (data || []).map((w: any) => ({
        ...w,
        profiles: w.profiles,
        approvals: approvalsMap[w.id] || [],
      }));

      setWithdrawals(enriched);
    } catch (err) {
      console.error('Error fetching withdrawal status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminCancel = async (withdrawalId: string) => {
    setCancelling(withdrawalId);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-withdrawal-approve', {
        body: { action: 'cancel_cooling_off', withdrawal_id: withdrawalId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Withdrawal cancelled");
      fetchWithdrawals();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
    } finally {
      setCancelling(null);
    }
  };

  const parseRecipientFromNotes = (notes: string) => {
    const nameMatch = notes.match(/Name:\s*([^)]+)\)/);
    const categoryMatch = notes.match(/Category:\s*(\w+)/);
    return {
      name: nameMatch?.[1] || 'Unknown',
      category: categoryMatch?.[1] || '',
    };
  };

  if (loading) return null;
  if (withdrawals.length === 0) return null;

  return (
    <Card className="border-orange-200 dark:border-orange-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          Active Withdrawals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {withdrawals.map((w) => {
          const { name: recipientName, category } = parseRecipientFromNotes(w.notes || '');
          const requesterName = w.profiles?.full_name || 'Unknown';
          const secretaryApproval = w.approvals.find(a => a.approver_role === 'secretary');
          const treasurerApproval = w.approvals.find(a => a.approver_role === 'treasurer');
          const isCoolingOff = w.status === 'approved' && w.cooling_off_until;

          return (
            <div key={w.id} className="p-4 rounded-lg border space-y-3 bg-muted/30">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <p className="font-bold text-lg">KES {Number(w.amount).toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">
                    Requested by <strong>{requesterName}</strong>
                    {category && <> • <Badge variant="outline" className="capitalize text-xs ml-1">{category}</Badge></>}
                  </p>
                  <p className="text-sm text-muted-foreground">To: <strong>{recipientName}</strong></p>
                </div>
                <Badge 
                  variant={w.status === 'approved' ? 'default' : w.status === 'processing' ? 'secondary' : 'outline'}
                  className={isCoolingOff ? 'bg-orange-500 text-white' : ''}
                >
                  {isCoolingOff ? '24hr Hold' : w.status === 'pending_approval' ? 'Pending Approval' : w.status}
                </Badge>
              </div>

              {/* Approval statuses */}
              <div className="flex gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  {secretaryApproval?.decision === 'approved' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : secretaryApproval?.decision === 'rejected' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-500" />
                  )}
                  <span>Secretary: <strong className="capitalize">{secretaryApproval?.decision || 'pending'}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  {treasurerApproval?.decision === 'approved' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : treasurerApproval?.decision === 'rejected' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-500" />
                  )}
                  <span>Treasurer: <strong className="capitalize">{treasurerApproval?.decision || 'pending'}</strong></span>
                </div>
              </div>

              {/* Countdown timer */}
              {isCoolingOff && w.cooling_off_until && (
                <div className="p-3 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                  <p className="text-xs text-orange-700 dark:text-orange-300 mb-1">Payout will be sent after:</p>
                  <CountdownTimer targetDate={w.cooling_off_until} />
                  <p className="text-xs text-muted-foreground mt-1">Admin can cancel before the timer runs out</p>
                </div>
              )}

              {/* Admin cancel button */}
              {isAdmin && isCoolingOff && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleAdminCancel(w.id)}
                  disabled={cancelling === w.id}
                  className="w-full"
                >
                  {cancelling === w.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                  Cancel Withdrawal
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
