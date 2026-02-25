import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History } from "lucide-react";

interface Props {
  welfareId: string;
}

export const WelfareTransactionLog = ({ welfareId }: Props) => {
  const [contributions, setContributions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [welfareId]);

  const fetchData = async () => {
    try {
      // Fetch contributions
      const { data: contribs } = await supabase.functions.invoke(`welfare-contributions?welfare_id=${welfareId}`, { method: 'GET' });
      setContributions(contribs?.data || []);

      // Fetch withdrawals
      const { data: wds } = await supabase
        .from('withdrawals')
        .select('*, profiles:requested_by(full_name)')
        .eq('welfare_id', welfareId)
        .order('created_at', { ascending: false });
      setWithdrawals(wds || []);
    } catch (e) {
      console.error('Error fetching transactions:', e);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'pending': case 'pending_approval': return 'secondary';
      case 'rejected': case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) return <Card><CardContent className="py-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Contributions ({contributions.length})</CardTitle></CardHeader>
        <CardContent>
          {contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contributions yet</p>
          ) : (
            <div className="space-y-2">
              {contributions.slice(0, 20).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                  <div>
                    <p className="font-medium">{c.welfare_members?.profiles?.full_name || 'Member'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">KES {Number(c.gross_amount).toLocaleString()}</p>
                    <Badge variant={statusColor(c.payment_status) as any} className="text-xs">{c.payment_status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Withdrawals ({withdrawals.length})</CardTitle></CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No withdrawals yet</p>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                  <div>
                    <p className="font-medium">{(w as any).profiles?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{w.notes?.substring(0, 50)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">KES {Number(w.amount).toLocaleString()}</p>
                    <Badge variant={statusColor(w.status) as any} className="text-xs">{w.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
