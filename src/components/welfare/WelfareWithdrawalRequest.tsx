import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

interface Props {
  welfareId: string;
  availableBalance: number;
  onRequested: () => void;
}

export const WelfareWithdrawalRequest = ({ welfareId, availableBalance, onRequested }: Props) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    const numAmount = Number(amount);
    if (!user?.id) { toast.error("Please log in again and retry"); return; }
    if (!numAmount || numAmount <= 0) { toast.error("Enter a valid amount"); return; }
    if (numAmount > availableBalance) { toast.error("Insufficient balance"); return; }
    if (!recipientPhone.trim()) { toast.error("Recipient phone required"); return; }
    if (!category) { toast.error("Select a reason category"); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('withdrawals')
        .insert({
          welfare_id: welfareId,
          requested_by: user.id,
          amount: numAmount,
          commission_amount: 0,
          net_amount: numAmount,
          status: 'pending_approval',
          notes: `Category: ${category}. ${reason}. Recipient: ${recipientPhone}`,
        })
        .select()
        .single();

      if (error) throw error;

      // Create approval records for secretary and treasurer
      const { data: members, error: membersError } = await supabase
        .from('welfare_members')
        .select('id, role')
        .eq('welfare_id', welfareId)
        .in('role', ['secretary', 'treasurer'])
        .eq('status', 'active');

      if (membersError) throw membersError;

      if (!members || members.length < 2) {
        throw new Error("Welfare setup is incomplete: secretary and treasurer must be active");
      }

      const approvalInserts = await Promise.all(
        members.map((member) =>
          supabase.from('welfare_withdrawal_approvals').insert({
            withdrawal_id: data.id,
            welfare_id: welfareId,
            approver_id: member.id,
            approver_role: member.role,
            decision: 'pending',
          })
        )
      );

      const approvalError = approvalInserts.find((result) => result.error)?.error;
      if (approvalError) throw approvalError;

      toast.success("Withdrawal request submitted for approval");
      setAmount(""); setReason(""); setCategory(""); setRecipientPhone("");
      onRequested();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="h-4 w-4" />
          Request Withdrawal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Available: <strong>KES {availableBalance.toLocaleString()}</strong></p>

        <div className="space-y-2">
          <Label>Recipient Phone Number</Label>
          <Input placeholder="e.g., 0712345678" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Amount (KES)</Label>
          <Input type="number" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} min={10} max={availableBalance} />
        </div>

        <div className="space-y-2">
          <Label>Reason Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="medical">Medical</SelectItem>
              <SelectItem value="bereavement">Bereavement</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Additional Notes</Label>
          <Textarea placeholder="Provide details..." value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>

        <Button onClick={handleRequest} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Submit for Approval
        </Button>
        <p className="text-xs text-muted-foreground text-center">Both Secretary and Treasurer must approve before payout</p>
      </CardContent>
    </Card>
  );
};
