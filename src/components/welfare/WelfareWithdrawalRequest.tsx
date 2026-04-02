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
import { Loader2, Send, CheckCircle2 } from "lucide-react";

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
  const [recipientMemberId, setRecipientMemberId] = useState("");
  const [resolvedRecipient, setResolvedRecipient] = useState<{ name: string; phone: string; memberId: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const lookupMember = async () => {
    const code = recipientMemberId.trim().toUpperCase();
    if (!code) { toast.error("Enter a member ID"); return; }
    setLookingUp(true);
    setResolvedRecipient(null);
    try {
      const { data: member, error } = await supabase
        .from('welfare_members')
        .select('id, member_code, user_id, status')
        .eq('welfare_id', welfareId)
        .eq('member_code', code)
        .maybeSingle();

      if (error) throw error;
      if (!member) { toast.error("Member ID not found in this welfare group"); return; }
      if (member.status !== 'active') { toast.error("This member is not active"); return; }

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', member.user_id)
        .single();

      if (pErr || !profile?.phone) { toast.error("Could not resolve member's phone number"); return; }

      setResolvedRecipient({ name: profile.full_name || 'Unknown', phone: profile.phone, memberId: code });
      toast.success(`Recipient: ${profile.full_name}`);
    } catch (err: any) {
      toast.error(err.message || "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

  const handleRequest = async () => {
    const numAmount = Number(amount);
    if (!user?.id) { toast.error("Please log in again and retry"); return; }
    if (!numAmount || numAmount <= 0) { toast.error("Enter a valid amount"); return; }
    if (numAmount > availableBalance) { toast.error("Insufficient balance"); return; }
    if (!resolvedRecipient) { toast.error("Look up the recipient member ID first"); return; }
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
          notes: `Category: ${category}. ${reason}. Recipient: ${resolvedRecipient.phone} (Member ID: ${resolvedRecipient.memberId}, Name: ${resolvedRecipient.name})`,
        })
        .select()
        .single();

      if (error) throw error;

      // Create approval records for secretary and treasurer
      const { data: members, error: membersError } = await supabase
        .from('welfare_members')
        .select('id, role, user_id')
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

      // Notify secretary and treasurer
      await Promise.all(
        members.map((member) =>
          supabase.from('notifications').insert({
            user_id: member.user_id,
            title: 'Welfare Withdrawal Pending Your Approval',
            message: `A withdrawal of KES ${numAmount.toLocaleString()} (${category}) to ${resolvedRecipient.name} requires your approval as ${member.role}.`,
            category: 'welfare',
            type: 'action_required',
            related_entity_type: 'welfare',
            related_entity_id: welfareId,
          })
        )
      );

      toast.success("Withdrawal request submitted for approval");
      setAmount(""); setReason(""); setCategory(""); setRecipientMemberId(""); setResolvedRecipient(null);
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
          <Label>Recipient Member ID</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g., Q8KKM0001"
              value={recipientMemberId}
              onChange={(e) => { setRecipientMemberId(e.target.value.toUpperCase()); setResolvedRecipient(null); }}
              className="font-mono"
            />
            <Button type="button" variant="outline" onClick={lookupMember} disabled={lookingUp || !recipientMemberId.trim()}>
              {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </Button>
          </div>
          {resolvedRecipient && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/30 rounded-md p-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span><strong>{resolvedRecipient.name}</strong> — {resolvedRecipient.phone}</span>
            </div>
          )}
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

        <Button onClick={handleRequest} disabled={loading || !resolvedRecipient} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Submit for Approval
        </Button>
        <p className="text-xs text-muted-foreground text-center">Both Secretary and Treasurer must approve before payout</p>
      </CardContent>
    </Card>
  );
};
