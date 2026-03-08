import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { UserCheck, UserX, Clock, Loader2 } from "lucide-react";
import { TrustScoreBadge } from "@/components/chama/TrustScoreBadge";

interface PendingMember {
  id: string;
  user_id: string;
  approval_status: string;
  joined_at: string;
  profiles: {
    full_name: string;
    email: string;
    phone: string;
  } | null;
}

interface TrustScore {
  user_id: string;
  trust_score: number;
}

interface ChamaPendingRequestsProps {
  chamaId: string;
  isManager: boolean;
  onUpdate?: () => void;
}

export const ChamaPendingRequests = ({ chamaId, isManager, onUpdate }: ChamaPendingRequestsProps) => {
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [trustScores, setTrustScores] = useState<Record<string, number>>({});
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadPendingMembers();
  }, [chamaId]);

  const loadPendingMembers = async () => {
    try {
      setLoadingMembers(true);

      const { data, error } = await supabase
        .from("chama_members")
        .select(`
          id,
          user_id,
          approval_status,
          joined_at,
          profiles!chama_members_user_id_fkey (
            full_name,
            email,
            phone
          )
        `)
        .eq("chama_id", chamaId)
        .eq("approval_status", "pending")
        .order("joined_at", { ascending: true });

      if (error) {
        console.error("Error loading pending members:", error);
        setPendingMembers([]);
      } else {
        const uniqueMembers = Array.from(
          new Map((data || []).map((m: PendingMember) => [m.id, m])).values()
        );
        setPendingMembers(uniqueMembers);

        // Load trust scores for pending members
        if (uniqueMembers.length > 0 && isManager) {
          const userIds = uniqueMembers.map(m => m.user_id).filter(Boolean);
          const { data: scores } = await supabase
            .from('member_trust_scores' as any)
            .select('user_id, trust_score')
            .in('user_id', userIds);

          if (scores) {
            const scoreMap: Record<string, number> = {};
            (scores as any[]).forEach((s: any) => { scoreMap[s.user_id] = s.trust_score; });
            setTrustScores(scoreMap);
          }
        }
      }
    } catch (error: any) {
      console.error("Error loading pending members:", error);
      setPendingMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleApproval = async (memberId: string, approved: boolean) => {
    if (!isManager) {
      toast({ title: "Access Denied", description: "Only managers can approve or reject requests", variant: "destructive" });
      return;
    }

    setProcessingId(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-join`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ member_id: memberId, approved }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process request');
      }

      const data = await response.json();
      if (!data?.success) throw new Error(data?.error || "Failed to process request");

      toast({
        title: "Success",
        description: approved
          ? "Join request approved! Member has been added to the chama."
          : "Join request rejected.",
      });

      await loadPendingMembers();
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error("Error processing approval:", error);
      toast({ title: "Error", description: error.message || "Failed to process request", variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  if (loadingMembers) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (pendingMembers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Pending Join Requests
        </CardTitle>
        <CardDescription>
          {isManager ? "Review and approve or reject join requests" : "Join requests awaiting manager approval"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pendingMembers.map((member) => {
            const profile = member.profiles;
            const fullName = profile?.full_name ?? "Unknown User";
            const email = profile?.email ?? "No email available";
            const score = trustScores[member.user_id];

            return (
              <div key={member.id} className="flex flex-col gap-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{fullName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground truncate">{fullName}</p>
                      {isManager && score !== undefined && (
                        <TrustScoreBadge score={score} compact />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{email}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested: {new Date(member.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isManager ? (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => handleApproval(member.id, true)}
                        disabled={processingId === member.id}
                      >
                        {processingId === member.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><UserCheck className="h-4 w-4 mr-1" />Approve</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleApproval(member.id, false)}
                        disabled={processingId === member.id}
                      >
                        {processingId === member.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><UserX className="h-4 w-4 mr-1" />Reject</>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending Approval
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
