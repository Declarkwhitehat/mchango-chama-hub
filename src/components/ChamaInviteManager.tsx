import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, X, AlertCircle, Users } from "lucide-react";
import { format } from "date-fns";

interface InviteCode {
  id: string;
  code: string;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  is_active: boolean;
  expires_at: string | null;
  used_profile?: {
    full_name: string;
    email: string;
  };
}

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
  isManager: boolean;
}

export const ChamaInviteManager = ({ chamaId, isManager }: ChamaInviteManagerProps) => {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [generateCount, setGenerateCount] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (isManager) {
      loadInviteCodes();
      loadPendingMembers();
    }
  }, [chamaId, isManager]);

  const loadInviteCodes = async () => {
    const { data, error } = await supabase.functions.invoke(`chama-invite/list/${chamaId}`);
    
    if (error) {
      console.error("Error loading invite codes:", error);
      return;
    }

    setInviteCodes(data.data || []);
  };

  const loadPendingMembers = async () => {
    const { data, error } = await supabase.functions.invoke(`chama-join/pending/${chamaId}`);
    
    if (error) {
      console.error("Error loading pending members:", error);
      return;
    }

    setPendingMembers(data.data || []);
  };

  const handleGenerateCodes = async () => {
    if (generateCount < 1 || generateCount > 20) {
      toast({
        title: "Invalid count",
        description: "Please generate between 1 and 20 codes at a time",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("chama-invite/generate", {
        body: {
          chama_id: chamaId,
          count: generateCount,
        },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: `Generated ${data.data.length} invite code(s)`,
      });

      await loadInviteCodes();
      setGenerateCount(1);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate invite codes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (code: string) => {
    const inviteUrl = `${window.location.origin}/chama/join?code=${code}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    toast({
      title: "Copied!",
      description: "Invite link copied to clipboard",
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleApproval = async (memberId: string, action: "approve" | "reject") => {
    try {
      const { error } = await supabase.functions.invoke(`chama-join/approve/${memberId}`, {
        body: { action },
        method: "PUT",
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

      {/* Generate Invite Codes */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Invite Codes</CardTitle>
          <CardDescription>
            Create unique invite codes for new members. Each code can be used once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="count">Number of Codes</Label>
              <Input
                id="count"
                type="number"
                min="1"
                max="20"
                value={generateCount}
                onChange={(e) => setGenerateCount(Number(e.target.value))}
              />
            </div>
            <Button onClick={handleGenerateCodes} disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate"}
            </Button>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Generate codes based on available spots. Each code is one-time use and must be approved by managers.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Invite Codes List */}
      <Card>
        <CardHeader>
          <CardTitle>Invite Codes ({inviteCodes.length})</CardTitle>
          <CardDescription>
            Share these codes with people you want to invite
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inviteCodes.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No invite codes generated yet
            </p>
          ) : (
            <div className="space-y-3">
              {inviteCodes.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-lg font-mono font-bold">{invite.code}</code>
                      {invite.used_by ? (
                        <Badge variant="secondary">Used</Badge>
                      ) : invite.is_active ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                    {invite.used_by && invite.used_profile && (
                      <p className="text-sm text-muted-foreground">
                        Used by: {invite.used_profile.full_name} on{" "}
                        {format(new Date(invite.used_at!), "PPp")}
                      </p>
                    )}
                    {!invite.used_by && (
                      <p className="text-xs text-muted-foreground">
                        Created: {format(new Date(invite.created_at), "PPp")}
                      </p>
                    )}
                  </div>
                  {!invite.used_by && invite.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(invite.code)}
                    >
                      {copiedCode === invite.code ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy Link
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
