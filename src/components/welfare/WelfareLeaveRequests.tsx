import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, LogOut, Check, X } from "lucide-react";

interface Props {
  welfareId: string;
  canDecide: boolean; // true for active chairman/secretary/treasurer
  onDecided?: () => void;
}

interface LeaveRequest {
  id: string;
  member_id: string;
  user_id: string;
  reason: string | null;
  status: string;
  created_at: string;
  member_code?: string;
  full_name?: string;
}

export const WelfareLeaveRequests = ({ welfareId, canDecide, onDecided }: Props) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("welfare_leave_requests")
        .select("id, member_id, user_id, reason, status, created_at")
        .eq("welfare_id", welfareId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = data || [];
      if (list.length === 0) {
        setRequests([]);
        return;
      }

      // Resolve member codes and names
      const memberIds = list.map((r: any) => r.member_id);
      const userIds = list.map((r: any) => r.user_id);

      const [{ data: members }, { data: profiles }] = await Promise.all([
        supabase.from("welfare_members").select("id, member_code").in("id", memberIds),
        supabase.from("profiles").select("id, full_name").in("id", userIds),
      ]);

      const memberMap = new Map((members || []).map((m: any) => [m.id, m.member_code]));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

      setRequests(
        list.map((r: any) => ({
          ...r,
          member_code: memberMap.get(r.member_id) || "",
          full_name: profileMap.get(r.user_id) || "Unknown",
        }))
      );
    } catch (err: any) {
      console.error("Failed to load leave requests", err);
      toast.error(err.message || "Failed to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [welfareId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const decide = async (req: LeaveRequest, decision: "approved" | "rejected") => {
    if (!user?.id) return;
    setDecidingId(req.id);
    try {
      const { error } = await supabase
        .from("welfare_leave_requests")
        .update({
          status: decision,
          decision_notes: notes[req.id]?.trim() || null,
          decided_by: user.id,
          decided_at: new Date().toISOString(),
        })
        .eq("id", req.id)
        .eq("status", "pending");

      if (error) throw error;

      // Notify the requester
      await supabase.from("notifications").insert({
        user_id: req.user_id,
        title: decision === "approved" ? "Leave Request Approved" : "Leave Request Rejected",
        message:
          decision === "approved"
            ? `Your request to leave the welfare has been approved. Your membership has ended.`
            : `Your request to leave the welfare was rejected.${notes[req.id]?.trim() ? ` Notes: ${notes[req.id].trim()}` : ""}`,
        category: "welfare",
        type: decision === "approved" ? "success" : "info",
        related_entity_type: "welfare",
        related_entity_id: welfareId,
      });

      toast.success(`Leave request ${decision}`);
      await fetchRequests();
      onDecided?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update request");
    } finally {
      setDecidingId(null);
    }
  };

  if (!canDecide) return null;
  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LogOut className="h-4 w-4 text-amber-600" />
          Leave Requests Awaiting Your Decision
          <Badge variant="secondary">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((req) => (
          <div key={req.id} className="rounded-lg border bg-background p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">{req.full_name}</p>
                <p className="text-xs font-mono text-muted-foreground">{req.member_code}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Requested {new Date(req.created_at).toLocaleString()}
                </p>
              </div>
              <Badge variant="outline" className="capitalize">{req.status}</Badge>
            </div>

            {req.reason && (
              <p className="text-sm text-foreground bg-muted/50 rounded p-2">
                <span className="text-xs font-medium text-muted-foreground">Reason: </span>
                {req.reason}
              </p>
            )}

            <Textarea
              placeholder="Optional decision notes (visible to the requester)"
              value={notes[req.id] || ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
              rows={2}
              className="text-sm"
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => decide(req, "approved")}
                disabled={decidingId === req.id}
              >
                {decidingId === req.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-destructive border-destructive hover:bg-destructive/10"
                onClick={() => decide(req, "rejected")}
                disabled={decidingId === req.id}
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
