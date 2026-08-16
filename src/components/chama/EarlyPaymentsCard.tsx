import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, CheckCircle2, Clock } from "lucide-react";

interface Row {
  id: string;
  member_id: string;
  amount: number;
  status: string;
  created_at: string;
  applied_at: string | null;
}

interface MemberInfo {
  member_code: string | null;
  full_name: string | null;
}

interface EarlyPaymentsCardProps {
  chamaId: string;
}

/**
 * Lists money members paid BEFORE the chama started (or any credit not yet
 * applied to a cycle). Visible to managers and admins so nobody's offline
 * Paybill payment goes unseen after the start reshuffle changed member codes.
 */
export function EarlyPaymentsCard({ chamaId }: EarlyPaymentsCardProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: wallet } = await supabase
          .from("chama_overpayment_wallet")
          .select("id, member_id, amount, status, created_at, applied_at")
          .eq("chama_id", chamaId)
          .order("created_at", { ascending: true })
          .limit(50);

        const walletRows = (wallet || []) as Row[];
        if (cancelled) return;
        setRows(walletRows);

        const ids = [...new Set(walletRows.map((r) => r.member_id))];
        if (ids.length > 0) {
          const { data: memberRows } = await supabase
            .from("chama_members")
            .select("id, member_code, profiles:user_id (full_name)")
            .in("id", ids);

          if (cancelled) return;
          const map: Record<string, MemberInfo> = {};
          for (const m of memberRows || []) {
            map[(m as any).id] = {
              member_code: (m as any).member_code,
              full_name: (m as any).profiles?.full_name ?? null,
            };
          }
          setMembers(map);
        }
      } catch (err) {
        console.error("Error loading early payments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [chamaId]);

  if (loading || rows.length === 0) return null;

  const pendingTotal = rows
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Nairobi",
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Early &amp; Unapplied Payments
          </span>
          {pendingTotal > 0 && (
            <Badge variant="secondary">KES {pendingTotal.toLocaleString()} unapplied</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Money received before the chama started or ahead of a cycle. Amounts shown are net of
          commission and are automatically applied to cycles as they open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const info = members[row.member_id];
          const applied = row.status === "applied";
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{info?.full_name || "Member"}</p>
                <p className="text-xs text-muted-foreground">
                  {info?.member_code || "—"} • Received {fmt(row.created_at)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">KES {Number(row.amount).toLocaleString()}</p>
                <p className="text-xs flex items-center gap-1 justify-end text-muted-foreground">
                  {applied ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-600" /> Applied
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3" /> Awaiting cycle
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
