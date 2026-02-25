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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!amount || !startDate || !endDate) { toast.error("All fields required"); return; }
    if (Number(amount) <= 0) { toast.error("Amount must be positive"); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-cycles', {
        method: 'POST',
        body: { welfare_id: welfareId, amount: Number(amount), start_date: startDate, end_date: endDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Contribution cycle created!");
      setAmount(""); setStartDate(""); setEndDate("");
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
        <p className="text-sm text-muted-foreground">As Secretary, set the contribution amount and period for members.</p>
        <div className="space-y-2">
          <Label>Amount per member (KES)</Label>
          <Input type="number" placeholder="e.g., 1000" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Set Contribution Cycle
        </Button>
      </CardContent>
    </Card>
  );
};
