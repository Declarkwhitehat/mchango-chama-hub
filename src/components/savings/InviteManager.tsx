import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Copy, Link2, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface InviteCode {
  id: string;
  code: string;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  is_active: boolean;
  expires_at: string | null;
}

interface InviteManagerProps {
  groupId: string;
}

export function SavingsGroupInviteManager({ groupId }: InviteManagerProps) {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchInviteCodes();
  }, [groupId]);

  const fetchInviteCodes = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-invite/list/${groupId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch invite codes');
      }

      const data = await response.json();
      if (data?.invite_codes) {
        setInviteCodes(data.invite_codes);
      }
    } catch (error) {
      console.error('Error fetching invite codes:', error);
      toast.error('Failed to load invite codes');
    } finally {
      setLoading(false);
    }
  };

  const generateInviteCode = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to generate invite codes');
        return;
      }

      const { data, error } = await supabase.functions.invoke('savings-group-invite/generate', {
        body: { groupId },
      });

      if (error) throw error;

      toast.success('Invite code generated!');
      await fetchInviteCodes();
    } catch (error) {
      console.error('Error generating invite code:', error);
      toast.error('Failed to generate invite code');
    } finally {
      setGenerating(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/savings-groups/join?code=${code}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied to clipboard!');
  };

  const deleteInviteCode = async (codeId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to delete invite codes');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-invite/${codeId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete invite code');
      }

      toast.success('Invite code deleted');
      await fetchInviteCodes();
    } catch (error) {
      console.error('Error deleting invite code:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete invite code');
    }
  };

  if (loading) {
    return <div>Loading invite codes...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Invite Links
        </CardTitle>
        <CardDescription>
          Generate invite links to share with potential members
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={generateInviteCode} 
          disabled={generating}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {generating ? 'Generating...' : 'Generate New Invite Code'}
        </Button>

        <div className="space-y-3">
          {inviteCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No invite codes yet. Generate one to start inviting members!
            </p>
          ) : (
            inviteCodes.map((invite) => (
              <Card key={invite.id} className="border-border/50">
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={`${window.location.origin}/savings-groups/join?code=${invite.code}`}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copyInviteLink(invite.code)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => deleteInviteCode(invite.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Code: {invite.code}</span>
                      <span>Created: {format(new Date(invite.created_at), 'MMM d, yyyy')}</span>
                    </div>

                    {invite.used_by && (
                      <div className="text-xs text-muted-foreground">
                        Used on {format(new Date(invite.used_at!), 'MMM d, yyyy')}
                      </div>
                    )}

                    {!invite.is_active && (
                      <div className="text-xs text-destructive">Inactive</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
