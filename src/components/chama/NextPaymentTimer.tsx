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

type Mode = "due" | "next-cycle" | "awaiting-next" | "final-cycle";

interface TimerState {
  mode: Mode | null;
  /** Deadline to count down to (only for "due" and "next-cycle"). */
  deadline: Date | null;
  /** Deadline of the current open cycle, shown for reference. */
  currentDeadline: Date | null;
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

function formatDeadline(d: Date): string {
  return d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

export function NextPaymentTimer({ chamaId, memberId, refreshKey = 0 }: NextPaymentTimerProps) {
  const [state, setState] = useState<TimerState>({
    mode: null,
    deadline: null,
    currentDeadline: null,
    loading: true,
  });
  const [, setTick] = useState(0);

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
          if (!cancelled) setState({ mode: null, deadline: null, currentDeadline: null, loading: false });
          return;
        }

        const currentEnd = new Date(currentCycle.end_date);

        // Paid status for current cycle
        const { data: payment } = await supabase
          .from("member_cycle_payments")
          .select("fully_paid, is_paid")
          .eq("cycle_id", currentCycle.id)
          .eq("member_id", memberId)
          .maybeSingle();

        const isPaid = !!(payment?.fully_paid || payment?.is_paid);

        if (!isPaid) {
          if (!cancelled) {
            setState({ mode: "due", deadline: currentEnd, currentDeadline: currentEnd, loading: false });
          }
          return;
        }

        // Paid: only count down to a cycle that actually exists.
        const { data: nextCycle } = await supabase
          .from("contribution_cycles")
          .select("end_date")
          .eq("chama_id", chamaId)
          .gt("end_date", currentCycle.end_date)
          .order("end_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (nextCycle?.end_date) {
          if (!cancelled) {
            setState({
              mode: "next-cycle",
              deadline: new Date(nextCycle.end_date),
              currentDeadline: currentEnd,
              loading: false,
            });
          }
          return;
        }

        // No next cycle row yet — is this the final round? A single-round ROSCA
        // runs exactly one cycle per approved active member.
        const { count } = await supabase
          .from("chama_members")
          .select("id", { count: "exact", head: true })
          .eq("chama_id", chamaId)
          .eq("approval_status", "approved")
          .eq("status", "active");

        const totalRounds = count ?? 0;
        const isFinal = totalRounds > 0 && currentCycle.cycle_number >= totalRounds;

        if (!cancelled) {
          setState({
            mode: isFinal ? "final-cycle" : "awaiting-next",
            deadline: null,
            currentDeadline: currentEnd,
            loading: false,
          });
        }
      } catch (err) {
        console.error("NextPaymentTimer load error", err);
        if (!cancelled) setState({ mode: null, deadline: null, currentDeadline: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
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

  if (!state.mode) return null;

  const isDue = state.mode === "due";
  const remaining = state.deadline ? state.deadline.getTime() - Date.now() : null;

  const title =
    state.mode === "due"
      ? "Time left to pay this cycle"
      : state.mode === "next-cycle"
        ? "You're paid up for this cycle — next payment due in"
        : state.mode === "final-cycle"
          ? "You're fully paid — this is the final cycle"
          : "You're paid up for this cycle";

  const subtitle =
    state.mode === "final-cycle"
      ? `Payouts complete after the deadline: ${state.currentDeadline ? formatDeadline(state.currentDeadline) : "—"}`
      : state.mode === "awaiting-next"
        ? `The next cycle opens after the current deadline: ${state.currentDeadline ? formatDeadline(state.currentDeadline) : "—"}`
        : state.deadline
          ? `Deadline: ${formatDeadline(state.deadline)}`
          : null;

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 flex items-start gap-3",
        isDue ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/5",
      )}
    >
      {isDue ? (
        <Clock className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
      )}
      <div className="space-y-0.5">
        <p className={cn("text-sm font-medium", isDue ? "text-destructive" : "text-primary")}>{title}</p>
        {remaining !== null && (
          <p className={cn("text-lg font-bold tabular-nums", isDue ? "text-destructive" : "text-primary")}>
            {formatRemaining(remaining)}
          </p>
        )}
        {subtitle && (
          <p className={cn("text-xs", isDue ? "text-destructive/80" : "text-muted-foreground")}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
