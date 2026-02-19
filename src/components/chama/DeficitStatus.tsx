import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface Deficit {
  id: string;
  principal_amount: number;
  net_owed_to_recipient: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  commission_rate: number;
  non_payer_member: {
    member_code: string;
    profiles: { full_name: string } | null;
  };
  cycle: {
    cycle_number: number;
    start_date: string;
  };
  debt: {
    penalty_debt: number;
    penalty_remaining: number;
    principal_remaining: number;
    status: string;
  };
}

interface DeficitStatusProps {
  memberMemberId: string;
  chamaName: string;
}

export function DeficitStatus({ memberMemberId, chamaName }: DeficitStatusProps) {
  const [deficits, setDeficits] = useState<Deficit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeficits();
  }, [memberMemberId]);

  const fetchDeficits = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chama_cycle_deficits')
        .select(`
          id,
          principal_amount,
          net_owed_to_recipient,
          status,
          paid_at,
          created_at,
          commission_rate,
          non_payer_member:chama_members!non_payer_member_id(
            member_code,
            profiles!chama_members_user_id_fkey(full_name)
          ),
          cycle:contribution_cycles!cycle_id(cycle_number, start_date),
          debt:chama_member_debts!debt_id(
            penalty_debt,
            penalty_remaining,
            principal_remaining,
            status
          )
        `)
        .eq('recipient_member_id', memberMemberId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeficits((data as any) || []);
    } catch (err) {
      console.error('Error fetching deficits:', err);
    } finally {
      setLoading(false);
    }
  };

  const outstanding = deficits.filter(d => d.status === 'outstanding');
  const paid = deficits.filter(d => d.status === 'paid');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Your Deficit Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (deficits.length === 0) return null;

  const totalOutstanding = outstanding.reduce((s, d) => s + d.net_owed_to_recipient, 0);

  return (
    <Card className={outstanding.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-green-500/30 bg-green-500/5"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Your Payout Deficits
          </span>
          {outstanding.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              KES {totalOutstanding.toFixed(2)} owed to you
            </Badge>
          )}
          {outstanding.length === 0 && (
            <Badge variant="outline" className="text-xs border-green-500 text-green-600">
              All cleared
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {outstanding.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Outstanding</p>
            {outstanding.map(deficit => {
              const nonPayerName = (deficit.non_payer_member as any)?.profiles?.full_name || 'Unknown';
              const memberCode = (deficit.non_payer_member as any)?.member_code || '';
              const cycleNum = (deficit.cycle as any)?.cycle_number;
              const debt = deficit.debt as any;
              const penaltyRemaining = debt?.penalty_remaining ?? 0;
              const principalRemaining = debt?.principal_remaining ?? 0;
              const totalDebtRemaining = penaltyRemaining + principalRemaining;

              return (
                <div key={deficit.id} className="rounded-lg border border-destructive/20 bg-background p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium text-sm">{nonPayerName}</span>
                      <Badge variant="outline" className="text-xs">{memberCode}</Badge>
                    </div>
                    <Badge variant="destructive" className="text-xs">Outstanding</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 ml-6 text-xs text-muted-foreground">
                    <div>
                      <span className="block">Cycle #{cycleNum}</span>
                      <span className="block">You're owed: <span className="font-semibold text-foreground">KES {deficit.net_owed_to_recipient.toFixed(2)}</span></span>
                    </div>
                    <div>
                      <span className="block">Their debt remaining: <span className="font-semibold text-destructive">KES {totalDebtRemaining.toFixed(2)}</span></span>
                      <span className="block">(KES {principalRemaining.toFixed(2)} + KES {penaltyRemaining.toFixed(2)} penalty)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {paid.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Cleared</p>
            {paid.map(deficit => {
              const nonPayerName = (deficit.non_payer_member as any)?.profiles?.full_name || 'Unknown';
              const memberCode = (deficit.non_payer_member as any)?.member_code || '';
              const cycleNum = (deficit.cycle as any)?.cycle_number;
              return (
                <div key={deficit.id} className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-muted-foreground">{nonPayerName} ({memberCode})</span>
                      <span className="text-xs text-muted-foreground">Cycle #{cycleNum}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-600">KES {deficit.net_owed_to_recipient.toFixed(2)}</span>
                      <Badge variant="outline" className="text-xs border-green-500 text-green-600">Paid ✓</Badge>
                    </div>
                  </div>
                  {deficit.paid_at && (
                    <p className="text-xs text-muted-foreground ml-6 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Cleared {new Date(deficit.paid_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground italic">
          These amounts are automatically transferred to you when the non-paying member clears their debt.
        </p>
      </CardContent>
    </Card>
  );
}
