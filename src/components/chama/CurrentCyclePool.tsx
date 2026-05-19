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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const nowIso = new Date().toISOString();
        const { data: cycle } = await supabase
          .from("contribution_cycles")
          .select("id")
          .eq("chama_id", chamaId)
          .lte("start_date", nowIso)
          .gte("end_date", nowIso)
          .order("cycle_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cycle) {
          setCollectedNet(0);
          setPaidCount(0);
          return;
        }

        const { data: payments } = await supabase
          .from("member_cycle_payments")
          .select("amount_paid, amount_due, fully_paid")
          .eq("cycle_id", cycle.id);

        const rows = payments || [];
        // Cap each member's contribution at amount_due so overpayments don't inflate the pool
        const grossInPool = rows.reduce(
          (s, r) => s + Math.min(Number(r.amount_paid || 0), Number(r.amount_due || 0)),
          0
        );
        // Subtract commission to show net (what gets paid out)
        const net = grossInPool * (1 - commissionRate);
        setCollectedNet(net);
        setPaidCount(rows.filter((r) => r.fully_paid).length);
        setTotalMembers(rows.length);
      } catch (e) {
        console.error("CurrentCyclePool load error", e);
      } finally {
        setLoading(false);
      }
    };
    load();
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
