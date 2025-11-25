import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingRequestsProps {
  groupId: string;
  pendingMembers: any[];
  isManager: boolean;
  onUpdate: () => void;
}

export function SavingsGroupPendingRequests({
  groupId,
  pendingMembers,
  isManager,
  onUpdate,
}: PendingRequestsProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleApproveMember = async (memberId: string, approved: boolean) => {
    setActionLoading(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-members/groups/${groupId}/members/${memberId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ approved }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update member');
      }

      toast({
        title: "Success!",
        description: approved 
          ? `Member approved with ID: ${result.unique_member_id}`
          : "Member rejected and removed",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (!pendingMembers || pendingMembers.length === 0) {
    return null;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">
          Pending Join Requests ({pendingMembers.length})
        </h3>
      </div>

      <div className="space-y-4">
        {pendingMembers.map((member) => {
          const profile = member.profiles;
          const initials = profile?.full_name
            ?.split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "?";

          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1">
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{profile?.full_name || "Unknown"}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {profile?.email || "No email"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Requested {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                  </p>
                </div>
                {!isManager && (
                  <Badge variant="secondary">Pending Approval</Badge>
                )}
              </div>

              {isManager && (
                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleApproveMember(member.id, true)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === member.id ? (
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
                    variant="destructive"
                    onClick={() => handleApproveMember(member.id, false)}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
