import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Clock, AlertTriangle } from "lucide-react";

interface AdminDeadlineAdjustProps {
  entityType: "chama_cycle" | "welfare_cycle";
  entityId: string;
  currentEndDate: string;
  currentAmount: number;
  entityName: string;
  onUpdated?: () => void;
}

export const AdminDeadlineAdjust = ({
  entityType,
  entityId,
  currentEndDate,
  currentAmount,
  entityName,
  onUpdated,
}: AdminDeadlineAdjustProps) => {
  const [open, setOpen] = useState(false);
  const [newEndDate, setNewEndDate] = useState(currentEndDate.slice(0, 16)); // datetime-local format
  const [newAmount, setNewAmount] = useState(currentAmount.toString());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!reason.trim()) {
      toast({ title: "Error", description: "Please provide a reason for the adjustment", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const table = entityType === "chama_cycle" ? "contribution_cycles" : "welfare_contribution_cycles";
      const updates: Record<string, any> = {};

      if (newEndDate !== currentEndDate.slice(0, 16)) {
        updates.end_date = new Date(newEndDate).toISOString();
      }

      if (entityType === "chama_cycle" && parseFloat(newAmount) !== currentAmount) {
        updates.due_amount = parseFloat(newAmount);
      } else if (entityType === "welfare_cycle" && parseFloat(newAmount) !== currentAmount) {
        updates.required_amount = parseFloat(newAmount);
      }

      if (Object.keys(updates).length === 0) {
        toast({ title: "No Changes", description: "No adjustments were made" });
        setOpen(false);
        return;
      }

      const { error } = await supabase
        .from(table)
        .update(updates)
        .eq("id", entityId);

      if (error) throw error;

      // Log the adjustment
      await supabase.from("audit_logs").insert({
        table_name: table,
        action: "admin_deadline_adjustment",
        record_id: entityId,
        user_id: user?.id,
        old_values: { end_date: currentEndDate, amount: currentAmount },
        new_values: { ...updates, reason: reason.trim() },
      });

      toast({ title: "Adjusted", description: `Deadline/amount updated for ${entityName}` });
      setOpen(false);
      onUpdated?.();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: err.message || "Failed to adjust deadline", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Adjust Deadline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Adjust Deadline / Amount
          </DialogTitle>
          <DialogDescription>
            Override the deadline or amount for: <strong>{entityName}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>End Date & Time</Label>
            <Input
              type="datetime-local"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Amount (KES)</Label>
            <Input
              type="number"
              min="0"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Reason for Adjustment *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this adjustment is needed..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !reason.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
