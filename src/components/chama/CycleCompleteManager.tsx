import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface RejoinRequest {
  id: string;
  user_id: string;
  requested_at: string;
  status: string;
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
}

export function CycleCompleteManager({ chamaId, chamaName, minMembers }: CycleCompleteManagerProps) {
  const [rejoinRequests, setRejoinRequests] = useState<RejoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [startingCycle, setStartingCycle] = useState(false);

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

      if (!response.ok) {
        throw new Error('Failed to process request');
      }

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
          Cycle Complete - Start New Cycle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center space-y-2">
          <Badge variant="default" className="text-lg px-4 py-1">
            {approvedRequests.length} / {minMembers} Members Approved
          </Badge>
          <p className="text-sm text-muted-foreground">
            {canStartCycle 
              ? "Ready to start new cycle with randomized payout order!" 
              : `Need at least ${minMembers - approvedRequests.length} more approved members`}
          </p>
        </div>

        {pendingRequests.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Pending Rejoin Requests ({pendingRequests.length})</h4>
            {pendingRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between border rounded-lg p-3 bg-background">
                <div>
                  <p className="font-medium">{request.profiles.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {request.previous_member 
                      ? `Previously: Member #${request.previous_member.order_index} (${request.previous_member.member_code})`
                      : 'New member'}
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

        {approvedRequests.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Approved Members ({approvedRequests.length})</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {approvedRequests.map((request) => (
                <div key={request.id} className="flex items-center gap-2 text-sm p-2 bg-background rounded border">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{request.profiles.full_name}</span>
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
