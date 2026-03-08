import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Copy, Check, X, Link2, Plus, Loader2, Users } from "lucide-react";
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [batchCount, setBatchCount] = useState(5);

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

      toast({ title: "Success!", description: "Invite code generated successfully" });
      await loadInviteCodes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to generate invite code", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateBatchCodes = async () => {
    setIsBatchGenerating(true);
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
          body: JSON.stringify({ action: "batch_generate", chama_id: chamaId, count: batchCount }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate batch codes');
      }

      const data = await response.json();
      toast({ title: "Success!", description: `${data.count} invite codes generated` });
      await loadInviteCodes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to generate batch codes", variant: "destructive" });
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const copyInviteLink = async (code: string) => {
    const baseUrl = 'https://mchango-chama-hub.lovable.app';
    const inviteUrl = `${baseUrl}/chama/join/${chamaSlug}?code=${code}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    toast({ title: "Copied!", description: "Invite link copied to clipboard" });
    setTimeout(() => setCopiedCode(null), 2000);
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
                Invite Codes
              </CardTitle>
              <CardDescription>
                Generate and share invite codes with people you want to invite
              </CardDescription>
            </div>
            <Button onClick={generateInviteCode} disabled={isGenerating} size="sm">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generating...</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" />Generate Code</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Batch Generate Section */}
          <div className="flex items-end gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="batch-count" className="text-sm">Batch Generate</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="batch-count"
                  type="number"
                  min={1}
                  max={30}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">codes (max 30)</span>
              </div>
            </div>
            <Button onClick={generateBatchCodes} disabled={isBatchGenerating} size="sm" variant="secondary">
              {isBatchGenerating ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generating...</>
              ) : (
                <><Users className="h-4 w-4 mr-1" />Generate Batch</>
              )}
            </Button>
          </div>

          {isLoadingCodes ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : activeCodes.length === 0 ? (
            <Alert>
              <AlertDescription>
                No active invite codes. Generate one to start inviting members.
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
                    <Button size="sm" variant="outline" onClick={() => copyInviteLink(inviteCode.code)}>
                      {copiedCode === inviteCode.code ? (
                        <><Check className="h-4 w-4 mr-1" />Copied</>
                      ) : (
                        <><Copy className="h-4 w-4 mr-1" />Copy Link</>
                      )}
                    </Button>
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
              Each code can only be used once. You'll need to approve join requests before members are added.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};
