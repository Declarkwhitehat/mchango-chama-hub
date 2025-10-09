import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export const AccountAdjustment = () => {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId || !amount || !reason) {
      toast({
        title: "Error",
        description: "All fields are required",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const adjustmentAmount = Number(amount);
      if (isNaN(adjustmentAmount) || adjustmentAmount <= 0) {
        throw new Error("Invalid amount");
      }

      // Create transaction record
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          amount: adjustmentAmount,
          transaction_type: type === 'credit' ? 'donation' : 'payout',
          payment_method: 'manual_adjustment',
          payment_reference: `ADMIN-${Date.now()}`,
          status: 'completed',
        })
        .select()
        .single();

      if (txError) throw txError;

      // Create audit log
      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          action: 'UPDATE',
          table_name: 'transactions',
          record_id: transaction.id,
          new_values: {
            type: type,
            amount: adjustmentAmount,
            reason: reason,
          },
        });

      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      toast({
        title: "Success",
        description: `Account ${type}ed with KES ${adjustmentAmount.toLocaleString()}`,
      });

      // Reset form
      setUserId("");
      setAmount("");
      setReason("");
    } catch (error: any) {
      console.error('Adjustment error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process adjustment",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Account Adjustment</CardTitle>
        <CardDescription>
          Credit or debit user accounts manually (creates audit trail)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAdjustment} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              placeholder="Enter user UUID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(val: "credit" | "debit") => setType(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-green-600" />
                      Credit (Add)
                    </div>
                  </SelectItem>
                  <SelectItem value="debit">
                    <div className="flex items-center gap-2">
                      <Minus className="h-4 w-4 text-red-600" />
                      Debit (Subtract)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (KES)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (for audit trail)</Label>
            <Textarea
              id="reason"
              placeholder="Describe the reason for this adjustment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={processing}
            variant={type === 'credit' ? 'default' : 'destructive'}
          >
            {type === 'credit' ? <Plus className="mr-2 h-4 w-4" /> : <Minus className="mr-2 h-4 w-4" />}
            {processing ? "Processing..." : `${type === 'credit' ? 'Credit' : 'Debit'} Account`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
