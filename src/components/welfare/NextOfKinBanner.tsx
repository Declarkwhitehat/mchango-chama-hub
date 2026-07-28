import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

interface Props {
  welfareId: string;
  onFill: () => void;
  refreshKey?: number;
}

/** Small reminder shown to members who have not yet nominated a next of kin. */
export function NextOfKinBanner({ welfareId, onFill, refreshKey }: Props) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      const { count } = await supabase
        .from("welfare_next_of_kin")
        .select("id", { count: "exact", head: true })
        .eq("welfare_id", welfareId)
        .eq("user_id", user.id);
      if (!cancelled) setShow((count || 0) === 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [welfareId, user?.id, refreshKey]);

  if (!show) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Add your next of kin</p>
        <p className="text-xs text-muted-foreground">
          Nominate the person who will receive your dividends and benefits if anything happens to you.
          Seen only by the administration.
        </p>
      </div>
      <Button size="sm" onClick={onFill} className="shrink-0">
        Fill Details
      </Button>
    </div>
  );
}
