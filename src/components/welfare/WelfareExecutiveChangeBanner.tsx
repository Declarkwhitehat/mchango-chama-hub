import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Clock, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ExecutiveChange {
  id: string;
  change_type: string;
  old_role: string | null;
  new_role: string | null;
  affected_user_name: string | null;
  new_user_name: string | null;
  cooldown_hours: number;
  cooldown_ends_at: string;
  pending_withdrawals_cancelled: number;
  admin_decision: string;
  created_at: string;
}

interface Props {
  welfareId: string;
  onCooldownActive?: (active: boolean) => void;
}

export const WelfareExecutiveChangeBanner = ({ welfareId, onCooldownActive }: Props) => {
  const [changes, setChanges] = useState<ExecutiveChange[]>([]);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    fetchChanges();
  }, [welfareId]);

  useEffect(() => {
    if (changes.length === 0) {
      onCooldownActive?.(false);
      return;
    }
    onCooldownActive?.(true);

    const timer = setInterval(() => {
      const latest = changes[0];
      const end = new Date(latest.cooldown_ends_at).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        clearInterval(timer);
        fetchChanges(); // Re-check
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }, 1000);

    return () => clearInterval(timer);
  }, [changes]);

  const fetchChanges = async () => {
    const { data } = await supabase
      .from('welfare_executive_changes')
      .select('*')
      .eq('welfare_id', welfareId)
      .eq('admin_decision', 'pending')
      .gt('cooldown_ends_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    setChanges((data as ExecutiveChange[]) || []);
  };

  if (changes.length === 0) return null;

  const totalCancelled = changes.reduce((sum, c) => sum + (c.pending_withdrawals_cancelled || 0), 0);

  return (
    <Alert variant="destructive" className="mb-4 border-2 border-destructive bg-destructive/10">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle className="text-base font-bold flex items-center gap-2">
        ⚠️ Executive Members Changed — Withdrawals Blocked
      </AlertTitle>
      <AlertDescription className="mt-3 space-y-3">
        {/* Timer */}
        <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
          <Clock className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold">Security cooldown ends in: </span>
          <Badge variant="destructive" className="text-sm font-mono">{timeLeft}</Badge>
        </div>

        {/* Change details */}
        <div className="space-y-2">
          {changes.map((change) => (
            <div key={change.id} className="p-2 rounded-md bg-background/80 border text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                {change.affected_user_name && (
                  <span>
                    <strong>Outgoing:</strong> {change.affected_user_name}
                    {change.old_role && <Badge variant="outline" className="ml-1 capitalize text-xs">{change.old_role}</Badge>}
                  </span>
                )}
                {change.new_user_name && (
                  <span>
                    <strong>Incoming:</strong> {change.new_user_name}
                    {change.new_role && <Badge variant="outline" className="ml-1 capitalize text-xs">{change.new_role}</Badge>}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {totalCancelled > 0 && (
          <p className="text-sm font-medium text-destructive">
            🚫 {totalCancelled} pending withdrawal(s) were automatically cancelled.
          </p>
        )}

        <div className="flex items-center gap-2 p-2 rounded-md bg-muted border text-sm">
          <Phone className="h-4 w-4" />
          <span>If this looks suspicious, <strong>contact customer care immediately</strong>.</span>
        </div>
      </AlertDescription>
    </Alert>
  );
};
