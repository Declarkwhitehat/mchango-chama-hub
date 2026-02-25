import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";

interface Props {
  welfareId: string;
  memberId: string;
  contributionAmount: number;
  paybillAccountId: string;
  onContributed: () => void;
}

export const WelfareContributionForm = ({ welfareId, memberId, contributionAmount, paybillAccountId, onContributed }: Props) => {
  const [amount, setAmount] = useState(contributionAmount > 0 ? String(contributionAmount) : "");
  const [loading, setLoading] = useState(false);

  const handleContribute = async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-contributions', {
        method: 'POST',
        body: { welfare_id: welfareId, amount: numAmount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Contribution of KES ${numAmount.toLocaleString()} recorded!`);
      onContributed();
    } catch (error: any) {
      toast.error(error.message || "Failed to contribute");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Offline Payment Info */}
      {paybillAccountId && (
        <CopyableUniqueId label="Welfare Payment ID" uniqueId={paybillAccountId} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Make Contribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contributionAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              Current cycle amount: <strong>KES {contributionAmount.toLocaleString()}</strong>
            </p>
          )}
          <div className="space-y-2">
            <Label>Amount (KES)</Label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
            />
          </div>
          <p className="text-xs text-muted-foreground">5% commission will be deducted automatically</p>
          <Button onClick={handleContribute} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Contribute KES {Number(amount || 0).toLocaleString()}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
