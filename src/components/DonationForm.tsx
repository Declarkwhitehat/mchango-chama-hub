import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingDown, Wallet } from "lucide-react";
import { MCHANGO_COMMISSION_RATE, calculateCommission, calculateNetBalance } from "@/utils/commissionCalculator";
import { normalizePhone, isValidKenyanPhone } from "@/utils/phoneUtils";

interface DonationFormProps {
  mchangoId: string;
  mchangoTitle: string;
  onSuccess?: () => void;
}

export const DonationForm = ({ mchangoId, mchangoTitle, onSuccess }: DonationFormProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [amount, setAmount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid donation amount",
        variant: "destructive",
      });
      return;
    }

    // Require name if not anonymous
    if (!isAnonymous && !displayName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your name or select 'Donate anonymously'",
        variant: "destructive",
      });
      return;
    }

    if (!phone || !isValidKenyanPhone(phone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number (e.g., 0707874790, +254707874790)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Get active session (works for both logged-in and guest flows)
      const { data: { session } } = await supabase.auth.getSession();
      const activeUserId = session?.user?.id ?? null;
      const activeUserEmail = session?.user?.email ?? null;
      
      // Create pending donation record
      const donationId = crypto.randomUUID();

      const donationData = {
        id: donationId,
        mchango_id: mchangoId,
        user_id: activeUserId,
        display_name: isAnonymous ? "Anonymous" : (displayName || "Anonymous"),
        phone: phone,
        email: activeUserId ? activeUserEmail : null,
        amount: parseFloat(amount),
        is_anonymous: isAnonymous,
        payment_reference: `DON-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        payment_method: "mpesa",
        payment_status: "pending",
      };

      const { error: donationError } = await supabase
        .from("mchango_donations")
        .insert(donationData);

      if (donationError) throw donationError;

      // Initiate M-Pesa STK Push with normalized phone
      const { data: stkResponse, error: stkError } = await supabase.functions.invoke("payment-stk-push", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: {
          phone_number: normalizePhone(phone),
          amount: parseFloat(amount),
          account_reference: mchangoTitle,
          transaction_desc: `Donation to ${mchangoTitle}`,
          callback_metadata: {
            donation_id: donationId,
            mchango_id: mchangoId,
          },
        }
      });

      if (stkError) throw stkError;

      // Validate STK push response
      const checkoutRequestId = stkResponse?.CheckoutRequestID;
      const responseCode = stkResponse?.ResponseCode;

      if (!checkoutRequestId || (responseCode && responseCode !== "0")) {
        throw new Error(
          stkResponse?.CustomerMessage ||
          stkResponse?.ResponseDescription ||
          "Failed to initiate M-Pesa payment. Please try again."
        );
      }

      // Update donation with CheckoutRequestID for callback matching
      await supabase
        .from("mchango_donations")
        .update({ payment_reference: checkoutRequestId })
        .eq("id", donation.id);

      // Optional: show the exact message from M-Pesa
      const customerMessage = stkResponse?.CustomerMessage;
      if (customerMessage) {
        toast({
          title: "M-Pesa",
          description: customerMessage,
        });
      }

      // Quick status check to surface immediate failures (e.g. non‑M-Pesa line)
      try {
        await new Promise((r) => setTimeout(r, 2500));

        const { data: statusData } = await supabase.functions.invoke("payment-stk-query", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          body: { checkout_request_id: checkoutRequestId },
        });

        const resultCode = statusData?.ResultCode;
        const resultDesc = statusData?.ResultDesc;

        if (typeof resultCode === "number" && resultCode !== 0) {
          throw new Error(resultDesc || "M-Pesa payment failed. Please try again.");
        }
      } catch (statusErr: any) {
        throw new Error(statusErr?.message || "M-Pesa payment failed. Please try again.");
      }

      const donationAmount = parseFloat(amount);
      const commission = calculateCommission(donationAmount, MCHANGO_COMMISSION_RATE);
      const netAmount = calculateNetBalance(donationAmount, MCHANGO_COMMISSION_RATE);

      toast({
        title: "Payment Initiated",
        description: `Donating KES ${donationAmount.toLocaleString()}. After ${(MCHANGO_COMMISSION_RATE * 100)}% commission (KES ${commission.toLocaleString()}), the campaign receives KES ${netAmount.toLocaleString()}`,
      });

      // Reset form
      setAmount("");
      if (!user) {
        setDisplayName("");
        setPhone("");
      }
      setIsAnonymous(false);

      // Prompt anonymous donors to create an account for transparency
      if (!user) {
        setTimeout(() => {
          toast({
            title: "Want withdrawal updates? 📢",
            description: "Create an account to receive notifications when this campaign makes withdrawals. This ensures accountability.",
            duration: 10000,
          });
        }, 3000);
      }

      onSuccess?.();
    } catch (error: any) {
      console.error("Donation error:", error);
      toast({
        title: "Donation Failed",
        description: error.message || "Failed to initiate donation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Make a Donation</CardTitle>
        <CardDescription>
          Support this campaign with your contribution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleDonate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (KES)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="1"
            />
          </div>

          {parseFloat(amount || "0") > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your Donation</span>
                  <span className="font-semibold">KES {parseFloat(amount).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                    <TrendingDown className="h-3 w-3" />
                    Commission (7%)
                  </span>
                  <span className="font-medium text-orange-600 dark:text-orange-400">
                    - KES {calculateCommission(parseFloat(amount), MCHANGO_COMMISSION_RATE).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                  <span className="flex items-center gap-1 font-medium text-primary">
                    <Wallet className="h-4 w-4" />
                    Campaign Receives
                  </span>
                  <span className="font-bold text-lg text-primary">
                    KES {calculateNetBalance(parseFloat(amount), MCHANGO_COMMISSION_RATE).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  * Commission is deducted immediately to cover platform costs
                </p>
              </CardContent>
            </Card>
          )}

          {/* Display Name - always show for all users */}
          <div className="space-y-2">
            <Label htmlFor="display_name">
              Your Name {!isAnonymous && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="display_name"
              type="text"
              placeholder={isAnonymous ? "Will show as 'Anonymous'" : "How should your name appear?"}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isAnonymous}
              required={!isAnonymous}
            />
            {!isAnonymous && (
              <p className="text-xs text-muted-foreground">
                This name will be shown in the recent contributions list
              </p>
            )}
            {isAnonymous && (
              <p className="text-xs text-muted-foreground">
                Your donation will appear as "Anonymous"
              </p>
            )}
          </div>

          {/* Phone Number - always required */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
            <Input
              id="phone"
              type="tel"
              placeholder="0707874790 or +254707874790"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              For M-Pesa payment. Accepts: 0707874790, +254707874790
            </p>
          </div>


          <div className="flex items-center space-x-2">
            <Checkbox
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={(checked) => setIsAnonymous(checked as boolean)}
            />
            <Label htmlFor="anonymous" className="cursor-pointer">
              Donate anonymously (your name will not be shown publicly)
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Donate Now"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
