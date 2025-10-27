import { useState } from "react";
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

interface DonationFormProps {
  mchangoId: string;
  mchangoTitle: string;
  onSuccess?: () => void;
}

export const DonationForm = ({ mchangoId, mchangoTitle, onSuccess }: DonationFormProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [amount, setAmount] = useState("");
  const [displayName, setDisplayName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [email, setEmail] = useState(profile?.email || "");
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

    if (!user && !phone) {
      toast({
        title: "Phone Required",
        description: "Please provide your phone number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Create pending donation record
      const donationData = {
        mchango_id: mchangoId,
        user_id: user?.id || null,
        display_name: isAnonymous ? "Anonymous" : (displayName || "Anonymous"),
        phone: phone,
        email: email || null,
        amount: parseFloat(amount),
        is_anonymous: isAnonymous,
        payment_reference: `DON-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        payment_method: "mpesa",
        payment_status: "pending",
      };

      const { data: donation, error: donationError } = await supabase
        .from("mchango_donations")
        .insert(donationData)
        .select()
        .single();

      if (donationError) throw donationError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated. Please log in.");
      }

      // Initiate M-Pesa STK Push
      const { data: stkResponse, error: stkError } = await supabase.functions.invoke("mpesa-stk-push", {
        body: {
          phone_number: phone,
          amount: parseFloat(amount),
          account_reference: mchangoTitle,
          transaction_desc: `Donation to ${mchangoTitle}`,
          callback_metadata: {
            donation_id: donation.id,
            mchango_id: mchangoId,
          },
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (stkError) throw stkError;

      // Update donation with M-Pesa request IDs for tracking
      if (stkResponse?.mpesa_response) {
        const { MerchantRequestID, CheckoutRequestID } = stkResponse.mpesa_response;
        if (CheckoutRequestID) {
          await supabase
            .from("mchango_donations")
            .update({ 
              payment_reference: CheckoutRequestID  // Store checkout ID for callback matching
            })
            .eq("id", donation.id);
        }
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
                    Commission (15%)
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

          {!user && (
            <>
              <div className="space-y-2">
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isAnonymous}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="254XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </>
          )}

          {user && (
            <div className="space-y-2">
              <Label htmlFor="phone_user">Phone Number</Label>
              <Input
                id="phone_user"
                type="tel"
                placeholder="254XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          )}

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
