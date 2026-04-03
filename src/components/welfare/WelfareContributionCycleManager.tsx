import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CalendarDays } from "lucide-react";

interface Props {
  welfareId: string;
}

export const WelfareContributionCycleManager = ({ welfareId }: Props) => {
  const [amount, setAmount] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [loading, setLoading] = useState(false);

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
    } catch (error: any) {
      toast.error(error.message || "Failed to create cycle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Set Contribution Cycle
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
};
