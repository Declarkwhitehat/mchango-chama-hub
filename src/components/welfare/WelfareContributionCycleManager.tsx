import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CalendarDays, AlertTriangle, Clock } from "lucide-react";
import { differenceInDays, differenceInHours, parseISO, format } from "date-fns";

interface Props {
  welfareId: string;
}

export const WelfareContributionCycleManager = ({ welfareId }: Props) => {
  const [amount, setAmount] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [checkingCycle, setCheckingCycle] = useState(true);

  useEffect(() => {
    checkActiveCycle();
  }, [welfareId]);

  const checkActiveCycle = async () => {
    setCheckingCycle(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('welfare_contribution_cycles')
        .select('*')
        .eq('welfare_id', welfareId)
        .eq('status', 'active')
        .gte('end_date', today)
        .order('created_at', { ascending: false })
        .limit(1);

      setActiveCycle(data?.[0] || null);
    } catch (err) {
      console.error('Error checking active cycle:', err);
    } finally {
      setCheckingCycle(false);
    }
  };

  const handleCreate = async () => {
    if (!amount || !deadlineDays) { toast.error("Amount and deadline are required"); return; }
    if (Number(amount) <= 0) { toast.error("Amount must be positive"); return; }
    if (Number(deadlineDays) < 1) { toast.error("Deadline must be at least 1 day"); return; }

    const startDate = new Date().toISOString().split('T')[0];
    const end = new Date();
    end.setDate(end.getDate() + Number(deadlineDays));
    const endDate = end.toISOString().split('T')[0];

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-cycles', {
        method: 'POST',
        body: { welfare_id: welfareId, amount: Number(amount), start_date: startDate, end_date: endDate, deadline_days: Number(deadlineDays) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Contribution cycle created!");
      setAmount(""); setDeadlineDays("");
      checkActiveCycle();
    } catch (error: any) {
      toast.error(error.message || "Failed to create cycle");
    } finally {
      setLoading(false);
    }
  };

  const cycleEndDate = activeCycle ? parseISO(activeCycle.end_date) : null;
  const now = new Date();
  const daysLeft = cycleEndDate ? differenceInDays(cycleEndDate, now) : 0;
  const hoursLeft = cycleEndDate ? differenceInHours(cycleEndDate, now) : 0;
  const hasActiveCycle = !!activeCycle && cycleEndDate && now < cycleEndDate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Set Contribution Cycle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {checkingCycle ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking...
          </div>
        ) : hasActiveCycle ? (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">Active cycle in progress</p>
              <p className="text-sm">
                Members are required to pay <strong>KES {Number(activeCycle.amount).toLocaleString()}</strong>.
              </p>
              <p className="text-sm">
                Deadline: <strong>{format(cycleEndDate!, 'MMM dd, yyyy')}</strong>
                {daysLeft > 0
                  ? ` (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`
                  : hoursLeft > 0
                  ? ` (${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} left)`
                  : ' (expires today)'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                You cannot set a new cycle until the current one expires.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Set the required contribution amount and deadline for all members.</p>
            <div className="space-y-2">
              <Label>Amount per member (KES)</Label>
              <Input type="number" placeholder="e.g., 1000" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} />
            </div>
            <div className="space-y-2">
              <Label>Deadline (days from today)</Label>
              <Input type="number" placeholder="e.g., 14" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} min={1} />
              {deadlineDays && Number(deadlineDays) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Deadline: {new Date(Date.now() + Number(deadlineDays) * 86400000).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button onClick={handleCreate} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Set Contribution Cycle
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};