import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Users } from "lucide-react";

interface ChamaPaymentFormProps {
  chamaId: string;
  currentMemberId: string;
  contributionAmount: number;
  onPaymentSuccess?: () => void;
}

export const ChamaPaymentForm = ({ 
  chamaId, 
  currentMemberId, 
  contributionAmount,
  onPaymentSuccess 
}: ChamaPaymentFormProps) => {
  const [paymentType, setPaymentType] = useState<"self" | "other">("self");
  const [targetMemberId, setTargetMemberId] = useState(currentMemberId);
  const [amount, setAmount] = useState(contributionAmount.toString());
  const [notes, setNotes] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [chamaId]);

  useEffect(() => {
    if (paymentType === "self") {
      setTargetMemberId(currentMemberId);
    }
  }, [paymentType, currentMemberId]);

  const loadMembers = async () => {
    try {
      setLoadingMembers(true);
      const { data, error } = await supabase
        .from('chama_members')
        .select(`
          id,
          member_code,
          order_index,
          profiles (
            full_name
          )
        `)
        .eq('chama_id', chamaId)
        .eq('approval_status', 'approved')
        .order('order_index');

      if (error) throw error;
      setMembers(data || []);
    } catch (error: any) {
      console.error("Error loading members:", error);
      toast({
        title: "Error",
        description: "Failed to load chama members",
        variant: "destructive",
      });
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const paymentData = {
        chama_id: chamaId,
        member_id: targetMemberId,
        paid_by_member_id: currentMemberId,
        amount: parseFloat(amount),
        payment_reference: `PAY-${Date.now()}`,
        status: 'completed',
        payment_notes: notes || null,
      };

      const { data, error } = await supabase.functions.invoke('contributions-crud', {
        body: paymentData,
      });

      if (error) throw error;

      const targetMember = members.find(m => m.id === targetMemberId);
      const payerMember = members.find(m => m.id === currentMemberId);
      
      let successMessage = "Payment successful!";
      if (paymentType === "other" && targetMember && payerMember) {
        successMessage = `Payment successful! ${payerMember.profiles.full_name} paid for ${targetMember.profiles.full_name}`;
      }

      // Show balance update info if available
      if (data.balance_update) {
        const { credit_added, deficit_added } = data.balance_update;
        if (credit_added > 0) {
          successMessage += ` (KES ${credit_added} credit added)`;
        } else if (deficit_added > 0) {
          successMessage += ` (KES ${deficit_added} deficit recorded)`;
        }
      }

      toast({
        title: "Success",
        description: successMessage,
      });

      // Reset form
      setAmount(contributionAmount.toString());
      setNotes("");
      setPaymentType("self");
      setTargetMemberId(currentMemberId);

      // Trigger refresh
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: error.message || "Failed to process payment",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Make Payment
        </CardTitle>
        <CardDescription>
          Contribute to your chama (Expected: KES {contributionAmount.toLocaleString()})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label>Payment Type</Label>
            <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as "self" | "other")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="self" id="self" />
                <Label htmlFor="self" className="font-normal cursor-pointer">
                  Pay for myself
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other" className="font-normal cursor-pointer flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Pay for another member
                </Label>
              </div>
            </RadioGroup>
          </div>

          {paymentType === "other" && (
            <div className="space-y-2">
              <Label htmlFor="target-member">Select Member</Label>
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading members...
                </div>
              ) : (
                <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                  <SelectTrigger id="target-member">
                    <SelectValue placeholder="Choose a member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.profiles.full_name} - {member.member_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (KES)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              required
            />
            {parseFloat(amount) !== contributionAmount && (
              <p className="text-xs text-muted-foreground">
                {parseFloat(amount) > contributionAmount 
                  ? `Overpayment of KES ${(parseFloat(amount) - contributionAmount).toLocaleString()} will be credited`
                  : `Underpayment of KES ${(contributionAmount - parseFloat(amount)).toLocaleString()} will be recorded as deficit`
                }
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any payment notes..."
              rows={2}
            />
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Payment...
              </>
            ) : (
              `Pay KES ${parseFloat(amount).toLocaleString()}`
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};