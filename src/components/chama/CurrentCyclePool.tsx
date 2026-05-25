import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wallet } from "lucide-react";
import { frequencyLabel } from "@/utils/chamaFrequency";

interface CurrentCyclePoolProps {
  chamaId: string;
  contributionAmount: number;
  commissionRate?: number;
  frequency: string;
  everyNDays?: number | null;
  refreshKey?: number;
}

/**
 * Shows the collected pool for the current open cycle — i.e. exactly the amount
 * that will be sent out as payout. Overpayments are stored separately in the
 * overpayment wallet and never inflate this figure.
 */
export const CurrentCyclePool = ({
  chamaId,
  contributionAmount,
  commissionRate = 0.05,
  frequency,
  everyNDays,
  refreshKey,
}: CurrentCyclePoolProps) => {
  const [collectedNet, setCollectedNet] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Authoritative server-side RPC — bypasses per-member RLS so every
      // member sees identical numbers for the current cycle pool.
      const { data, error } = await supabase.rpc("get_chama_current_pool", {
        p_chama_id: chamaId,
      });
      if (error) throw error;
      const payload: any = data || {};
      if (payload.error) throw new Error(payload.error);
      setCollectedNet(Number(payload.collected_net || 0));
      setPaidCount(Number(payload.paid_count || 0));
      setTotalMembers(Number(payload.total_members || 0));
    } catch (e) {
      console.error("CurrentCyclePool load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    // Realtime: refresh when payments or cycles for this chama change
    const channel = supabase
      .channel(`cycle-pool-${chamaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_cycle_payments" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contribution_cycles", filter: `chama_id=eq.${chamaId}` },
        () => load()
      )
      .subscribe();

    // App resume / visibility / online
    const onRefresh = () => load();
    window.addEventListener("app:refresh", onRefresh);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("app:refresh", onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamaId, refreshKey, commissionRate]);


  const isDaily = frequency === "daily";
  const label = isDaily
    ? "Today's Pool"
    : `Current ${frequencyLabel(frequency, everyNDays || undefined)} Pool`;

  const targetNet = totalMembers * contributionAmount * (1 - commissionRate);
  const fullPool = totalMembers > 0 && paidCount === totalMembers;

  return (
    <Card className="p-4 bg-primary/5 border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Wallet className="h-4 w-4" />
            {label}
          </div>
          <p className="text-2xl font-bold text-primary">
            KES {Math.round(collectedNet).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {loading
              ? "Loading…"
              : totalMembers === 0
              ? "No active cycle"
              : `${paidCount}/${totalMembers} members paid · Target KES ${Math.round(targetNet).toLocaleString()}`}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            This is exactly what will be sent as payout. Overpayments go to your wallet.
          </p>
        </div>
        {fullPool && (
          <span className="text-xs font-semibold text-primary-foreground bg-primary px-2 py-1 rounded">
            FULL
          </span>
        )}
      </div>
    </Card>
  );
};
