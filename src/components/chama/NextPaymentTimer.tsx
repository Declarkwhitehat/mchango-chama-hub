import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NextPaymentTimerProps {
  chamaId: string;
  memberId: string;
  /** Refresh trigger — bump to force a refetch (e.g. after a payment). */
  refreshKey?: number;
}

interface TimerState {
  deadline: Date | null;
  isPaidForCurrent: boolean;
  loading: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Deadline passed";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((ms % 60000) / 1000);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  if (days === 0 && hours === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function estimateNextDeadline(currentEnd: Date, freq: string | null, everyN: number | null): Date {
  const next = new Date(currentEnd);
  switch (freq) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "twice_monthly":
      next.setUTCDate(next.getUTCDate() + 15);
      break;
    case "every_n_days":
      next.setUTCDate(next.getUTCDate() + (everyN || 1));
      break;
    default:
      next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function NextPaymentTimer({ chamaId, memberId, refreshKey = 0 }: NextPaymentTimerProps) {
  const [state, setState] = useState<TimerState>({ deadline: null, isPaidForCurrent: false, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        // Current open cycle
        const { data: cycles } = await supabase
          .from("contribution_cycles")
          .select("id, end_date, cycle_number")
          .eq("chama_id", chamaId)
          .eq("is_complete", false)
          .order("end_date", { ascending: true })
          .limit(1);

        const currentCycle = cycles?.[0];
        if (!currentCycle) {
          if (!cancelled) setState({ deadline: null, isPaidForCurrent: false, loading: false });
          return;
        }

        // Paid status for current cycle
        const { data: payment } = await supabase
          .from("member_cycle_payments")
          .select("fully_paid, is_paid")
          .eq("cycle_id", currentCycle.id)
          .eq("member_id", memberId)
          .maybeSingle();

        const isPaid = !!(payment?.fully_paid || payment?.is_paid);
        const currentEnd = new Date(currentCycle.end_date);

        if (!isPaid) {
          if (!cancelled) setState({ deadline: currentEnd, isPaidForCurrent: false, loading: false });
          return;
        }

        // Paid: find next cycle's deadline (or estimate from frequency)
        const { data: nextCycle } = await supabase
          .from("contribution_cycles")
          .select("end_date")
          .eq("chama_id", chamaId)
          .gt("end_date", currentCycle.end_date)
          .order("end_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        let nextDeadline: Date;
        if (nextCycle?.end_date) {
          nextDeadline = new Date(nextCycle.end_date);
        } else {
          const { data: chama } = await supabase
            .from("chama")
            .select("contribution_frequency, every_n_days_count")
            .eq("id", chamaId)
            .maybeSingle();
          nextDeadline = estimateNextDeadline(
            currentEnd,
            (chama as any)?.contribution_frequency ?? null,
            (chama as any)?.every_n_days_count ?? null,
          );
        }

        if (!cancelled) setState({ deadline: nextDeadline, isPaidForCurrent: true, loading: false });
      } catch (err) {
        console.error("NextPaymentTimer load error", err);
        if (!cancelled) setState({ deadline: null, isPaidForCurrent: false, loading: false });
      }
    })();

    return () => { cancelled = true; };
  }, [chamaId, memberId, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (state.loading) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Loading payment timer…
      </div>
    );
  }

  if (!state.deadline) return null;

  const remaining = state.deadline.getTime() - Date.now();
  const urgent = !state.isPaidForCurrent && remaining > 0 && remaining < 4 * 60 * 60 * 1000;
  const passed = remaining <= 0;

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-start gap-3">
      {state.isPaidForCurrent ? (
        <CheckCircle2 className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
      ) : (
        <Clock className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
      )}
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-destructive">
          {state.isPaidForCurrent ? "Next payment due in" : "Time left to pay this cycle"}
        </p>
        <p className="text-lg font-bold tabular-nums text-destructive">
          {formatRemaining(remaining)}
        </p>
        <p className="text-xs text-destructive/80">
          Deadline: {state.deadline.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
    </div>
  );
}

