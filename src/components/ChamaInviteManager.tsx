import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link2, Plus, Loader2, X } from "lucide-react";
import { ShareMenu } from "@/components/ShareMenu";
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

interface ChamaInviteManagerProps {
  chamaId: string;
  chamaSlug: string;
  isManager: boolean;
}

export const ChamaInviteManager = ({ chamaId, chamaSlug, isManager }: ChamaInviteManagerProps) => {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);

  useEffect(() => {
    if (isManager) {
      loadInviteCodes();
    }
  }, [chamaId, isManager]);

  const loadInviteCodes = async () => {
    try {
      setIsLoadingCodes(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-invite`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: "list", chama_id: chamaId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load invite codes');
      }

      const data = await response.json();
      setInviteCodes(data.data || []);
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
        toast({ title: "Error", description: "Please log in to continue", variant: "destructive" });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-invite`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: "generate", chama_id: chamaId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate invite code');
      }

      toast({ title: "Success!", description: "New invite link generated. Any previous link has been deactivated." });
      await loadInviteCodes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to generate invite code", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteCode = async (codeId: string) => {
    try {
      const { error } = await supabase
        .from('chama_invite_codes')
        .delete()
        .eq('id', codeId);

      if (error) throw error;
      toast({ title: "Success", description: "Invite code deleted" });
      await loadInviteCodes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete code", variant: "destructive" });
    }
  };

  if (!isManager) return null;

  const activeCodes = inviteCodes.filter(code => code.is_active && !code.used_by);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Invite Link
              </CardTitle>
              <CardDescription>
                Generate an invite link to share with people you want to invite. Only one active link at a time.
              </CardDescription>
            </div>
            <Button onClick={generateInviteCode} disabled={isGenerating} size="sm">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generating...</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" />{activeCodes.length > 0 ? 'Regenerate' : 'Generate'} Link</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingCodes ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : activeCodes.length === 0 ? (
            <Alert>
              <AlertDescription>
                No active invite link. Generate one to start inviting members.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {activeCodes.map((inviteCode) => (
                <div key={inviteCode.id} className="flex items-center justify-between p-4 border rounded-lg">
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
                      <ShareMenu 
                        url={`https://mchango-chama-hub.lovable.app/chama/join/${chamaSlug}?code=${inviteCode.code}`}
                        title="Chama Invite"
                        text={`You're invited to join our Chama! Use code: ${inviteCode.code}`}
                        label="Share"
                      />
                      <Button size="sm" variant="destructive" onClick={() => deleteCode(inviteCode.id)}>
                        <X className="h-4 w-4 mr-1" />Delete
                      </Button>
                    </div>
                </div>
              ))}
            </div>
          )}
          <Alert>
            <Link2 className="h-4 w-4" />
            <AlertDescription>
              Each code can only be used once. Generating a new link deactivates the previous one.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};
