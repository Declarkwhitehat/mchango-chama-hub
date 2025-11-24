import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, X, Link2, Users, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface InviteCode {
  id: string;
  code: string;
  is_active: boolean;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
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
  chamaSlug: string;
  isManager: boolean;
}

export const ChamaInviteManager = ({ chamaId, chamaSlug, isManager }: ChamaInviteManagerProps) => {
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);

  useEffect(() => {
    if (isManager) {
      loadPendingMembers();
      loadInviteCodes();
    }
  }, [chamaId, isManager]);

  const loadPendingMembers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
      const { data, error } = await supabase.functions.invoke(`chama-join/pending/${chamaId}`, {
        method: 'GET'
      });
      
      if (error) {
        console.error("Error loading pending members:", error);
        return;
      }

      setPendingMembers(data?.data || []);
    } catch (err) {
      console.error("Failed to load pending members:", err);
    }
  };

  const loadInviteCodes = async () => {
    try {
      setIsLoadingCodes(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
      const { data, error } = await supabase.functions.invoke("chama-invite", {
        body: { action: "list", chama_id: chamaId }
      });
    
      if (error) {
        console.error("Error loading invite codes:", error);
      } else {
        setInviteCodes(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load invite codes:", err);
    } finally {
      setIsLoadingCodes(false);
    }
  };

  const generateInviteCode = async () => {
    setIsGenerating(true);
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

      const { data, error } = await supabase.functions.invoke("chama-invite", {
        body: { action: "generate", chama_id: chamaId }
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Invite code generated successfully",
      });

      await loadInviteCodes();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate invite code",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyInviteLink = async (code: string) => {
    const baseUrl = 'https://mchango-chama-hub.lovable.app';
    const inviteUrl = `${baseUrl}/chama/join/${chamaSlug}?code=${code}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    toast({
      title: "Copied!",
      description: "Invite link copied to clipboard",
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const deleteCode = async (codeId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { error } = await supabase
        .from('chama_invite_codes')
        .delete()
        .eq('id', codeId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Invite code deleted",
      });

      await loadInviteCodes();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete code",
        variant: "destructive",
      });
    }
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

      const { error } = await supabase.functions.invoke('chama-join', {
        method: 'PUT',
        body: { 
          member_id: memberId,
          action: action
        }
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
      {/* Invite Codes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Invite Codes
              </CardTitle>
              <CardDescription>
                Generate and share invite codes with people you want to invite
              </CardDescription>
            </div>
            <Button
              onClick={generateInviteCode}
              disabled={isGenerating}
              size="sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Generate Code
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingCodes ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : inviteCodes.length === 0 ? (
            <Alert>
              <AlertDescription>
                No active invite codes. Generate one to start inviting members.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {inviteCodes.filter(code => code.is_active && !code.used_by).map((inviteCode) => (
                <div
                  key={inviteCode.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-lg">{inviteCode.code}</code>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {format(new Date(inviteCode.created_at), "PPp")}
                    </p>
                    {inviteCode.expires_at && (
                      <p className="text-xs text-muted-foreground">
                        Expires: {format(new Date(inviteCode.expires_at), "PPp")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyInviteLink(inviteCode.code)}
                    >
                      {copiedCode === inviteCode.code ? (
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
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteCode(inviteCode.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              Each code expires after 24 hours and can only be used once. You'll need to approve join requests before members are added.
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
