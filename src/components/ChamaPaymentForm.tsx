import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Users, Phone } from "lucide-react";
import { CHAMA_DEFAULT_COMMISSION_RATE, CHAMA_LATE_COMMISSION_RATE, calculateAmountToPay } from "@/utils/commissionCalculator";
import { AmountToPayCard } from "@/components/chama/AmountToPayCard";
import { PaymentAllocationPreview } from "@/components/chama/PaymentAllocationPreview";
import { NextPaymentTimer } from "@/components/chama/NextPaymentTimer";

interface ChamaPaymentFormProps {
  chamaId: string;
  currentMemberId: string;
  contributionAmount: number;
  commissionRate?: number;
  missedCycles?: number;
  currentCycleDue?: boolean;
  onPaymentSuccess?: () => void;
}

export const ChamaPaymentForm = ({ 
  chamaId, 
  currentMemberId, 
  contributionAmount,
  commissionRate = CHAMA_DEFAULT_COMMISSION_RATE,
  missedCycles = 0,
  currentCycleDue = true,
  onPaymentSuccess 
}: ChamaPaymentFormProps) => {
  const navigate = useNavigate();
  const [paymentType, setPaymentType] = useState<"self" | "other">("self");
  const [targetMemberId, setTargetMemberId] = useState(currentMemberId);
  const [walletCredit, setWalletCredit] = useState(0);
  const [targetInfo, setTargetInfo] = useState<{
    loading: boolean;
    netOutstanding: number; // net still needed across all unpaid cycles
    paidThisCycle: number;
    cycleNetTarget: number;
    fullyPaid: boolean;
    memberName?: string;
    memberCode?: string;
  } | null>(null);
  // Self required amount (existing behaviour)
  const netCycleTarget = contributionAmount * (1 - commissionRate);
  const netStillNeeded = Math.max(0, netCycleTarget - walletCredit);
  const selfRequiredAmount =
    netStillNeeded > 0 ? Math.ceil(netStillNeeded / (1 - commissionRate)) : 0;

  // Target required amount when paying for another
  const targetRequiredAmount = targetInfo && targetInfo.netOutstanding > 0
    ? Math.ceil(targetInfo.netOutstanding / (1 - commissionRate))
    : 0;

  const requiredAmount = paymentType === "other"
    ? targetRequiredAmount
    : selfRequiredAmount;

  const [amount, setAmount] = useState(selfRequiredAmount.toString());
  const [notes, setNotes] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "pending" | "checking">("idle");
  const [timerRefreshKey, setTimerRefreshKey] = useState(0);

  useEffect(() => {
    loadMembers();
    loadUserPhone();
    loadWalletCredit();
  }, [chamaId, currentMemberId]);

  useEffect(() => {
    setAmount(requiredAmount.toString());
  }, [requiredAmount]);

  useEffect(() => {
    if (paymentType === "self") {
      setTargetMemberId(currentMemberId);
      setTargetInfo(null);
    }
  }, [paymentType, currentMemberId]);

  // Load target member's outstanding when picking someone else
  useEffect(() => {
    if (paymentType !== "other" || !targetMemberId || targetMemberId === currentMemberId) {
      return;
    }
    loadTargetInfo(targetMemberId);
  }, [paymentType, targetMemberId, currentMemberId, chamaId]);

  const loadTargetInfo = async (memberId: string) => {
    try {
      setTargetInfo((prev) => ({
        loading: true,
        netOutstanding: prev?.netOutstanding ?? 0,
        paidThisCycle: prev?.paidThisCycle ?? 0,
        cycleNetTarget: prev?.cycleNetTarget ?? contributionAmount * (1 - commissionRate),
        fullyPaid: false,
      }));

      const target = members.find((m) => m.id === memberId);
      // Sum unpaid balance across all unpaid cycles for this member
      const { data: unpaid } = await supabase
        .from('member_cycle_payments')
        .select('amount_due, amount_paid, is_paid, cycle_id, contribution_cycles!cycle_id(payout_processed, end_date)')
        .eq('member_id', memberId)
        .eq('is_paid', false);

      let netOutstanding = 0;
      let paidThisCycle = 0;
      let cycleNetTarget = contributionAmount * (1 - commissionRate);
      const todayIso = new Date().toISOString();
      for (const row of unpaid || []) {
        const cyc: any = (row as any).contribution_cycles;
        // Skip already paid-out cycles (defensive)
        if (cyc?.payout_processed) continue;
        const due = Number(row.amount_due || 0);
        const paid = Number(row.amount_paid || 0);
        netOutstanding += Math.max(0, due - paid);
        // Current-cycle stats (end_date in future)
        if (cyc?.end_date && cyc.end_date >= todayIso) {
          paidThisCycle = paid;
          cycleNetTarget = due;
        }
      }

      setTargetInfo({
        loading: false,
        netOutstanding,
        paidThisCycle,
        cycleNetTarget,
        fullyPaid: netOutstanding <= 0,
        memberName: target?.profiles?.full_name,
        memberCode: target?.member_code,
      });
    } catch (err) {
      console.error('loadTargetInfo error', err);
      setTargetInfo({
        loading: false,
        netOutstanding: 0,
        paidThisCycle: 0,
        cycleNetTarget: contributionAmount * (1 - commissionRate),
        fullyPaid: false,
      });
    }
  };

  const loadWalletCredit = async () => {
    try {
      const { data, error } = await supabase
        .from('chama_overpayment_wallet')
        .select('amount')
        .eq('chama_id', chamaId)
        .eq('member_id', currentMemberId)
        .eq('status', 'pending');
      if (error) throw error;
      const total = (data || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      setWalletCredit(total);
    } catch (err) {
      console.error('Error loading wallet credit:', err);
    }
  };

  const loadUserPhone = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .single();
        
        if (profile?.phone) {
          setPhoneNumber(profile.phone);
        }
      }
    } catch (error) {
      console.error("Error loading user phone:", error);
    }
  };

  const loadMembers = async () => {
    try {
      setLoadingMembers(true);
      const { data, error } = await supabase
        .from('chama_members')
        .select(`
          id,
          member_code,
          order_index,
          user_id,
          profiles (
            full_name
          )
        `)
        .eq('chama_id', chamaId)
        .eq('approval_status', 'approved')
        .eq('status', 'active')
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

    if (parseFloat(amount) < requiredAmount) {
      toast({
        title: "You'll under-pay",
        description: `You must pay at least KES ${requiredAmount.toLocaleString()} so the chama receives the full net for this cycle. Paying less will leave the cycle short.`,
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber) {
      toast({
        title: "Phone Required",
        description: "Please enter your M-Pesa phone number",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setPaymentStatus("pending");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Session Expired",
          description: "Please log in again to make a payment",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      // Get target member info for account reference
      const targetMember = members.find(m => m.id === targetMemberId);
      const payerMember = members.find(m => m.id === currentMemberId);
      
      // Generate idempotency key
      const idempotencyKey = `${chamaId}-${targetMemberId}-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;

      // Trigger M-Pesa STK Push
      const { data: stkResponse, error: stkError } = await supabase.functions.invoke('payment-stk-push', {
        body: {
          phone_number: phoneNumber,
          amount: parseFloat(amount),
          account_reference: targetMember?.member_code || `CHAMA-${chamaId.substring(0, 8)}`,
          transaction_desc: `Chama contribution`,
          chama_id: chamaId,
          idempotency_key: idempotencyKey,
          callback_metadata: {
            type: 'chama_contribution',
            chama_id: chamaId,
            member_id: targetMemberId,
            paid_by_member_id: currentMemberId,
            payer_user_id: session.user.id,
            beneficiary_user_id: targetMember?.user_id || session.user.id,
            notes: notes || null,
            idempotency_key: idempotencyKey,
          }
        }
      });

      if (stkError) throw stkError;

      console.log('STK Push response:', stkResponse);

      if (stkResponse?.ResponseCode === "0" || stkResponse?.CheckoutRequestID) {
        toast({
          title: "Payment Request Sent",
          description: "Please check your phone and enter your M-Pesa PIN to complete the payment",
        });
        
        setPaymentStatus("checking");
        
        // Poll for payment status
        const checkoutRequestId = stkResponse.CheckoutRequestID;
        const startedAt = new Date(Date.now() - 5000).toISOString();
        let attempts = 0;
        const maxAttempts = 12; // Check for 60 seconds (every 5 seconds)
        
        const checkPaymentStatus = async () => {
          attempts++;
          
          // 1) Check by checkout request id (STK callback path)
          const { data: contributionByRef } = await supabase
            .from('contributions')
            .select('*')
            .eq('payment_reference', checkoutRequestId)
            .maybeSingle();

          // 2) Fallback: C2B confirm path creates a fresh completed row and
          //    deletes the pending STK row. Look for any completed contribution
          //    for this member created after this attempt started.
          let completedFallback: any = null;
          if (!contributionByRef || contributionByRef.status !== 'completed') {
            const { data: recent } = await supabase
              .from('contributions')
              .select('*')
              .eq('chama_id', chamaId)
              .eq('member_id', targetMemberId)
              .eq('status', 'completed')
              .gte('created_at', startedAt)
              .order('created_at', { ascending: false })
              .limit(1);
            completedFallback = recent?.[0] || null;
          }

          const contributions = contributionByRef || completedFallback;

          if (contributions && contributions.status === 'completed') {
            setPaymentStatus("idle");
            toast({
              title: "Payment Successful!",
              description: `KES ${parseFloat(amount).toLocaleString()} contribution recorded`,
            });
            
            // Reset form
            setAmount(requiredAmount.toString());
            loadWalletCredit();
            setNotes("");
            setPaymentType("self");
            setTargetMemberId(currentMemberId);
            setTimerRefreshKey((k) => k + 1);
            
            if (onPaymentSuccess) {
              onPaymentSuccess();
            }
            return;
          }
          
          if (contributions && contributions.status === 'failed') {
            setPaymentStatus("idle");
            toast({
              title: "Payment Failed",
              description: "The M-Pesa payment was not completed. Please try again.",
              variant: "destructive",
            });
            return;
          }
          
          if (attempts < maxAttempts) {
            setTimeout(checkPaymentStatus, 5000);
          } else {
            setPaymentStatus("idle");
            toast({
              title: "Payment Pending",
              description: "Your payment is being processed. Check back shortly for confirmation.",
            });
          }
        };
        
        // Start checking after 10 seconds to give user time to enter PIN
        setTimeout(checkPaymentStatus, 10000);
        
      } else {
        throw new Error(stkResponse?.ResponseDescription || 'Failed to initiate payment');
      }

    } catch (error: any) {
      console.error("Payment error:", error);
      setPaymentStatus("idle");
      toast({
        title: "Payment Failed",
        description: error.message || "Failed to initiate M-Pesa payment",
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
          Make Payment via M-Pesa
        </CardTitle>
        <CardDescription>
          Contribute to your chama (Base: KES {contributionAmount.toLocaleString()} per cycle)
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
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              M-Pesa Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g., 0712345678"
              required
            />
            <p className="text-xs text-muted-foreground">
              You'll receive an M-Pesa prompt on this number
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (KES)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min={requiredAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Pay KES ${requiredAmount.toLocaleString()}`}
              required
            />
            <p className="text-xs text-muted-foreground">
              You should pay: <strong>KES {requiredAmount.toLocaleString()}</strong>
              {walletCredit > 0 && (
                <> (wallet credit of KES {walletCredit.toLocaleString()} already applied)</>
              )}
            </p>
            {parseFloat(amount) > requiredAmount && (
              <p className="text-xs text-green-600">
                Overpayment of KES {(parseFloat(amount) - requiredAmount).toLocaleString()} will be credited to your next cycle
              </p>
            )}
            {parseFloat(amount) > 0 && parseFloat(amount) < requiredAmount && (
              <p className="text-xs text-destructive font-medium">
                ⚠️ You'll under-pay — pay at least KES {requiredAmount.toLocaleString()} so the chama receives the full net for this cycle.
              </p>
            )}
          </div>

          {parseFloat(amount || "0") > 0 && (
            <PaymentAllocationPreview
              chamaId={chamaId}
              memberId={targetMemberId}
              grossAmount={parseFloat(amount)}
            />
          )}

          <NextPaymentTimer
            chamaId={chamaId}
            memberId={currentMemberId}
            refreshKey={timerRefreshKey}
          />


          <Button 
            type="submit" 
            disabled={isLoading || paymentStatus !== "idle"} 
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending M-Pesa Request...
              </>
            ) : paymentStatus === "checking" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for Payment...
              </>
            ) : (
              `Pay KES ${parseFloat(amount || "0").toLocaleString()} via M-Pesa`
            )}
          </Button>

          {paymentStatus === "checking" && (
            <p className="text-xs text-center text-muted-foreground">
              Check your phone for the M-Pesa prompt and enter your PIN
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
