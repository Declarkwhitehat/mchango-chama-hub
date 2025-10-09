import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, X, Link2, Users } from "lucide-react";
import { format } from "date-fns";

interface PendingMember {
  id: string;
  joined_at: string;
  member_code: string;
  order_index: number;
  profiles: {
    full_name: string;
    email: string;
    phone: string;
  };
}

interface ChamaInviteManagerProps {
  chamaId: string;
  chamaSlug: string;
  isManager: boolean;
}

export const ChamaInviteManager = ({ chamaId, chamaSlug, isManager }: ChamaInviteManagerProps) => {
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isManager) {
      loadPendingMembers();
    }
  }, [chamaId, isManager]);

  const loadPendingMembers = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    
    const { data, error } = await supabase.functions.invoke(`chama-join/pending/${chamaId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    
    if (error) {
      console.error("Error loading pending members:", error);
      return;
    }

    setPendingMembers(data.data || []);
  };

  const copyInviteLink = async () => {
    const inviteUrl = `${window.location.origin}/chama/join/${chamaSlug}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    toast({
      title: "Copied!",
      description: "Invite link copied to clipboard",
    });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleApproval = async (memberId: string, action: "approve" | "reject") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Error",
          description: "Please log in to continue",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.functions.invoke(`chama-join/approve/${memberId}`, {
        body: { action },
        method: "PUT",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: `Member ${action}d successfully`,
      });

      await loadPendingMembers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${action} member`,
        variant: "destructive",
      });
    }
  };

  if (!isManager) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Invite Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Invite Link
          </CardTitle>
          <CardDescription>
            Share this link with people you want to invite to join the Chama
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
              {`${window.location.origin}/chama/join/${chamaSlug}`}
            </div>
            <Button
              onClick={copyInviteLink}
              variant="outline"
            >
              {copiedLink ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              Anyone with this link can request to join. You'll need to approve their request before they become members.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Pending Join Requests */}
      {pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Pending Join Requests ({pendingMembers.length})
            </CardTitle>
            <CardDescription>
              Review and approve members who want to join
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <p className="font-medium">{member.profiles.full_name}</p>
                  <p className="text-sm text-muted-foreground">{member.profiles.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested: {format(new Date(member.joined_at), "PPp")}
                  </p>
                  <Badge variant="outline">Member Code: {member.member_code}</Badge>
                  <Badge variant="outline">Position: #{member.order_index}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleApproval(member.id, "approve")}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleApproval(member.id, "reject")}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
