import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingDown, Wallet, Heart } from "lucide-react";
import { ORGANIZATION_COMMISSION_RATE, calculateCommission, calculateNetBalance } from "@/utils/commissionCalculator";
import { normalizePhone, isValidKenyanPhone } from "@/utils/phoneUtils";

interface OrganizationDonationFormProps {
  organizationId: string;
  organizationName: string;
  onSuccess?: () => void;
}

export const OrganizationDonationForm = ({ organizationId, organizationName, onSuccess }: OrganizationDonationFormProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [amount, setAmount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [email, setEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      const { data: { session } } = await supabase.auth.getSession();
      
      const donationData = {
        organization_id: organizationId,
        user_id: user?.id || null,
        display_name: isAnonymous ? "Anonymous" : (displayName || "Anonymous"),
        phone: phone,
        email: email || null,
        amount: parseFloat(amount),
        is_anonymous: isAnonymous,
        payment_reference: `ORG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        payment_method: "mpesa",
        payment_status: "pending",
      };

      const { data: donation, error: donationError } = await supabase
        .from("organization_donations")
        .insert(donationData)
        .select()
        .single();

      if (donationError) throw donationError;

      // Initiate M-Pesa STK Push
      const { data: stkResponse, error: stkError } = await supabase.functions.invoke("mpesa-stk-push", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: {
          phone_number: normalizePhone(phone),
          amount: parseFloat(amount),
          account_reference: organizationName,
          transaction_desc: `Donation to ${organizationName}`,
          callback_metadata: {
            organization_donation_id: donation.id,
            organization_id: organizationId,
          },
        }
      });

      if (stkError) throw stkError;

      const checkoutRequestId = stkResponse?.CheckoutRequestID;
      const responseCode = stkResponse?.ResponseCode;

      if (!checkoutRequestId || (responseCode && responseCode !== "0")) {
        throw new Error(
          stkResponse?.CustomerMessage ||
          stkResponse?.ResponseDescription ||
          "Failed to initiate M-Pesa payment. Please try again."
        );
      }

      // Update donation with CheckoutRequestID
      await supabase
        .from("organization_donations")
        .update({ payment_reference: checkoutRequestId })
        .eq("id", donation.id);

      const customerMessage = stkResponse?.CustomerMessage;
      if (customerMessage) {
        toast({
          title: "M-Pesa",
          description: customerMessage,
        });
      }

      // Quick status check
      try {
        await new Promise((r) => setTimeout(r, 2500));

        const { data: statusData } = await supabase.functions.invoke("mpesa-stk-query", {
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
      const commission = calculateCommission(donationAmount, ORGANIZATION_COMMISSION_RATE);
      const netAmount = calculateNetBalance(donationAmount, ORGANIZATION_COMMISSION_RATE);

      toast({
        title: "Payment Initiated",
        description: `Donating KES ${donationAmount.toLocaleString()}. After ${(ORGANIZATION_COMMISSION_RATE * 100)}% commission, the organization receives KES ${netAmount.toLocaleString()}`,
      });

      // Reset form
      setAmount("");
      if (!user) {
        setDisplayName("");
        setPhone("");
        setEmail("");
      }
      setIsAnonymous(false);

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
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Heart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Support This Organization</CardTitle>
            <CardDescription>
              Your contribution helps {organizationName} continue their mission
            </CardDescription>
          </div>
        </div>
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
                    Commission (5%)
                  </span>
                  <span className="font-medium text-orange-600 dark:text-orange-400">
                    - KES {calculateCommission(parseFloat(amount), ORGANIZATION_COMMISSION_RATE).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                  <span className="flex items-center gap-1 font-medium text-primary">
                    <Wallet className="h-4 w-4" />
                    Organization Receives
                  </span>
                  <span className="font-bold text-lg text-primary">
                    KES {calculateNetBalance(parseFloat(amount), ORGANIZATION_COMMISSION_RATE).toLocaleString()}
                  </span>
                </div>
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
                This name will be shown in the supporters list
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
              For M-Pesa payment
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={(checked) => setIsAnonymous(checked as boolean)}
            />
            <Label htmlFor="anonymous" className="cursor-pointer">
              Donate anonymously
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Heart className="mr-2 h-4 w-4" />
                Donate Now
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
