import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle, XCircle, Save, Edit2 } from "lucide-react";

interface RejoinRequest {
  id: string;
  user_id: string;
  requested_at: string;
  status: string;
  previous_member_id: string | null;
  profiles: {
    full_name: string;
    phone: string;
    email: string;
  };
  previous_member: {
    order_index: number;
    member_code: string;
  } | null;
}

interface CycleCompleteManagerProps {
  chamaId: string;
  chamaName: string;
  minMembers: number;
  contributionAmount: number;
  contributionFrequency: string;
  everyNDaysCount?: number;
}

export function CycleCompleteManager({ 
  chamaId, 
  chamaName, 
  minMembers,
  contributionAmount,
  contributionFrequency,
  everyNDaysCount
}: CycleCompleteManagerProps) {
  const [rejoinRequests, setRejoinRequests] = useState<RejoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [startingCycle, setStartingCycle] = useState(false);

  // Edit terms state
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(contributionAmount);
  const [editFrequency, setEditFrequency] = useState(contributionFrequency);
  const [editNDays, setEditNDays] = useState(everyNDaysCount || 7);
  const [savingTerms, setSavingTerms] = useState(false);

  useEffect(() => {
    loadRejoinRequests();
  }, [chamaId]);

  const loadRejoinRequests = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-rejoin/${chamaId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();
      if (response.ok) {
        setRejoinRequests(result.requests || []);
      }
    } catch (error) {
      console.error('Error loading rejoin requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTerms = async () => {
    setSavingTerms(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const updateBody: Record<string, any> = {
        contribution_amount: editAmount,
        contribution_frequency: editFrequency,
      };
      if (editFrequency === 'every_n_days') {
        updateBody.every_n_days_count = editNDays;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-crud/${chamaId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateBody),
        }
      );

      if (!response.ok) throw new Error('Failed to update terms');

      toast.success('Terms updated! All members will be notified.');
      setEditing(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save terms');
    } finally {
      setSavingTerms(false);
    }
  };

  const handleApproveReject = async (requestId: string, approve: boolean) => {
    setActionLoading(requestId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to continue");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-rejoin/${requestId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: approve ? 'approved' : 'rejected',
            notes: approve ? undefined : 'Manager declined rejoin request'
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to process request');

      toast.success(approve ? 'Request approved' : 'Request rejected');
      loadRejoinRequests();
    } catch (error: any) {
      toast.error(error.message || 'Failed to process request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartNewCycle = async () => {
    setStartingCycle(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to continue");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-start-new-cycle`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ chamaId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start new cycle');
      }

      toast.success(`New cycle started with ${result.memberCount} members!`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start new cycle');
    } finally {
      setStartingCycle(false);
    }
  };

  const pendingRequests = rejoinRequests.filter(r => r.status === 'pending');
  const approvedRequests = rejoinRequests.filter(r => r.status === 'approved');
  const canStartCycle = approvedRequests.length >= minMembers;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Cycle Complete - Manage New Cycle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Edit Terms Section */}
        <div className="bg-background border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Cycle Terms</h4>
            <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
              <Edit2 className="h-4 w-4 mr-1" />
              {editing ? 'Cancel' : 'Edit Terms'}
            </Button>
          </div>
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Contribution Amount (KES)</label>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Frequency</label>
                <Select value={editFrequency} onValueChange={setEditFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="every_n_days">Every N Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editFrequency === 'every_n_days' && (
                <div>
                  <label className="text-sm text-muted-foreground">Every N Days</label>
                  <Input
                    type="number"
                    value={editNDays}
                    onChange={(e) => setEditNDays(Number(e.target.value))}
                    min={1}
                  />
                </div>
              )}
              <Button onClick={handleSaveTerms} disabled={savingTerms} size="sm">
                {savingTerms ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save & Notify Members
              </Button>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <p>Amount: <span className="font-medium">KES {contributionAmount?.toLocaleString()}</span></p>
              <p>Frequency: <span className="font-medium">{contributionFrequency?.replace(/_/g, ' ')}</span></p>
            </div>
          )}
        </div>

        {/* Member status */}
        <div className="text-center space-y-2">
          <Badge variant="default" className="text-lg px-4 py-1">
            {approvedRequests.length} / {minMembers} Members Confirmed
          </Badge>
          <p className="text-sm text-muted-foreground">
            {canStartCycle 
              ? "Ready to start! Or wait for auto-restart in 48h." 
              : `Need ${minMembers - approvedRequests.length} more confirmed members`}
          </p>
          <p className="text-xs text-muted-foreground">
            ⏰ Auto-restarts 48h after completion. Deleted if &lt;40% rejoin within 24h.
          </p>
        </div>

        {/* Pending requests - only show for new members needing approval */}
        {pendingRequests.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold">New Member Requests ({pendingRequests.length})</h4>
            {pendingRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between border rounded-lg p-3 bg-background">
                <div>
                  <p className="font-medium">{request.profiles.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {request.previous_member_id ? 'Returning member' : '🆕 New member'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApproveReject(request.id, true)}
                    disabled={actionLoading === request.id}
                  >
                    {actionLoading === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApproveReject(request.id, false)}
                    disabled={actionLoading === request.id}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approved members */}
        {approvedRequests.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Confirmed Members ({approvedRequests.length})</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {approvedRequests.map((request) => (
                <div key={request.id} className="flex items-center gap-2 text-sm p-2 bg-background rounded border">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{request.profiles.full_name}</span>
                  {!request.previous_member_id && (
                    <Badge variant="outline" className="text-xs">New</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          onClick={handleStartNewCycle}
          disabled={!canStartCycle || startingCycle}
          size="lg"
          className="w-full"
        >
          {startingCycle ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Starting New Cycle...
            </>
          ) : (
            <>
              <RefreshCw className="h-5 w-5 mr-2" />
              Start New Cycle ({approvedRequests.length} Members)
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
