import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wallet, Smartphone, CheckCircle, XCircle, Clock, Search, UserCheck } from "lucide-react";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";
import { normalizePhone, isValidKenyanPhone } from "@/utils/phoneUtils";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  welfareId: string;
  memberId: string;
  memberCode: string;
  contributionAmount: number;
  paybillAccountId: string;
  onContributed: () => void;
}

type PaymentStatus = "idle" | "sending" | "prompted" | "checking" | "success" | "failed";

export const WelfareContributionForm = ({ welfareId, memberId, memberCode, contributionAmount, paybillAccountId, onContributed }: Props) => {
  const { user, profile } = useAuth();
  const [amount, setAmount] = useState(contributionAmount > 0 ? String(contributionAmount) : "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [name, setName] = useState(profile?.full_name || "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  // "Pay for another member" state
  const [payForOther, setPayForOther] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; member_code: string; full_name: string; user_id: string }>>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<{ member_code: string; full_name: string } | null>(null);

  const recipientCode = payForOther ? selectedRecipient?.member_code || "" : memberCode;

  const searchMembers = async () => {
    const q = searchQuery.trim();
    if (!q) {
      toast.error("Enter a Member ID or name to search");
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      // Get active members of this welfare
      const { data: members, error } = await supabase
        .from("welfare_members")
        .select("id, member_code, user_id, status")
        .eq("welfare_id", welfareId)
        .eq("status", "active");

      if (error) throw error;
      if (!members || members.length === 0) {
        toast.error("No active members found");
        return;
      }

      // Fetch profiles for these members
      const userIds = members.map((m: any) => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (pErr) throw pErr;

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || ""]));
      const upper = q.toUpperCase();
      const lower = q.toLowerCase();

      const matches = members
        .map((m: any) => ({
          id: m.id,
          member_code: m.member_code || "",
          user_id: m.user_id,
          full_name: profileMap.get(m.user_id) || "Unknown",
        }))
        // Exclude removed/left and exclude self (paying for self uses the default flow)
        .filter((m) => m.user_id !== user?.id)
        .filter(
          (m) =>
            m.member_code.toUpperCase().includes(upper) ||
            m.full_name.toLowerCase().includes(lower)
        )
        .slice(0, 20);

      if (matches.length === 0) {
        toast.error("No active members matched your search");
      }
      setSearchResults(matches);
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleStkPush = async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 1) {
      toast.error("Enter a valid amount (minimum KES 1)");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("Enter a valid Safaricom phone number (e.g. 0707874790)");
      return;
    }

    setPaymentStatus("sending");
    setStatusMessage("Sending payment request to your phone...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please log in again.");
        setPaymentStatus("idle");
        return;
      }

      // Initiate STK Push
      const { data: stkResponse, error: stkError } = await supabase.functions.invoke("payment-stk-push", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          phone_number: normalized,
          amount: numAmount,
          // Use the member's unique ID (e.g. G7BZM0001) so the STK prompt
          // shows the correct account and C2B can match the contribution to
          // this specific member, not just the welfare group.
          account_reference: memberCode || paybillAccountId || `WF-${welfareId.substring(0, 8)}`,
          transaction_desc: "Welfare contrib",
          callback_metadata: {
            type: "welfare_contribution",
            welfare_id: welfareId,
            member_id: memberId,
            user_id: user?.id,
          },
        },
      });

      if (stkError) throw stkError;

      const checkoutRequestId = stkResponse?.CheckoutRequestID;
      const responseCode = stkResponse?.ResponseCode;

      if (!checkoutRequestId || (responseCode && responseCode !== "0")) {
        throw new Error(
          stkResponse?.CustomerMessage ||
          stkResponse?.ResponseDescription ||
          "Failed to initiate payment. Please try again."
        );
      }

      setPaymentStatus("prompted");
      setStatusMessage("Check your phone and enter your M-Pesa PIN");

      if (stkResponse?.CustomerMessage) {
        toast.success(stkResponse.CustomerMessage);
      }

      // Quick status check after 3 seconds
      await new Promise((r) => setTimeout(r, 3000));
      setPaymentStatus("checking");
      setStatusMessage("Verifying payment...");

      const { data: statusData } = await supabase.functions.invoke("payment-stk-query", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { checkout_request_id: checkoutRequestId },
      });

      const resultCode = statusData?.ResultCode;

      if (resultCode === "0" || resultCode === 0) {
        // Payment confirmed — C2B callback already records the contribution and updates balances
        setPaymentStatus("success");
        setStatusMessage(`Payment of KES ${numAmount.toLocaleString()} successful!`);
        toast.success(`Contribution of KES ${numAmount.toLocaleString()} recorded!`);
        onContributed();
        
        // Reset after delay
        setTimeout(() => {
          setPaymentStatus("idle");
          setStatusMessage("");
        }, 4000);
        return;
      }

      if (resultCode === "1032") {
        setPaymentStatus("failed");
        setStatusMessage("Payment was cancelled by user");
        toast.error("Payment cancelled");
        setTimeout(() => { setPaymentStatus("idle"); setStatusMessage(""); }, 3000);
        return;
      }

      // Still processing - poll a few more times
      let attempts = 0;
      const maxAttempts = 8;

      const pollStatus = async () => {
        attempts++;
        await new Promise((r) => setTimeout(r, 5000));

        try {
          // Re-query STK status
          const { data: recheck } = await supabase.functions.invoke("payment-stk-query", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { checkout_request_id: checkoutRequestId },
          });

          if (recheck?.ResultCode === "0" || recheck?.ResultCode === 0) {
            // Payment confirmed — C2B callback already records the contribution
            setPaymentStatus("success");
            setStatusMessage(`Payment of KES ${numAmount.toLocaleString()} successful!`);
            toast.success(`Contribution of KES ${numAmount.toLocaleString()} recorded!`);
            onContributed();
            setTimeout(() => { setPaymentStatus("idle"); setStatusMessage(""); }, 4000);
            return;
          }

          if (recheck?.ResultCode === "1032") {
            setPaymentStatus("failed");
            setStatusMessage("Payment was cancelled");
            setTimeout(() => { setPaymentStatus("idle"); setStatusMessage(""); }, 3000);
            return;
          }

          if (attempts < maxAttempts) {
            setStatusMessage(`Verifying payment... (${attempts}/${maxAttempts})`);
            await pollStatus();
          } else {
            setPaymentStatus("idle");
            setStatusMessage("");
            toast.info("Payment verification timed out. If you completed the payment, it will be recorded automatically.");
          }
        } catch {
          if (attempts < maxAttempts) {
            await pollStatus();
          } else {
            setPaymentStatus("idle");
            setStatusMessage("");
            toast.info("Could not verify payment. Check your transaction history.");
          }
        }
      };

      await pollStatus();
    } catch (error: any) {
      console.error("STK Push error:", error);
      setPaymentStatus("failed");
      setStatusMessage(error.message || "Payment failed");
      toast.error(error.message || "Failed to initiate payment");
      setTimeout(() => { setPaymentStatus("idle"); setStatusMessage(""); }, 3000);
    }
  };

  const isProcessing = paymentStatus !== "idle" && paymentStatus !== "success" && paymentStatus !== "failed";

  const StatusIcon = () => {
    switch (paymentStatus) {
      case "sending":
      case "checking":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      case "prompted":
        return <Smartphone className="h-5 w-5 text-primary animate-pulse" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Member ID for offline payments - always show so members know their correct account */}
      {memberCode && (
        <CopyableUniqueId label="Your Member ID (Account Number)" uniqueId={memberCode} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Pay via M-Pesa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contributionAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              Current cycle amount: <strong>KES {contributionAmount.toLocaleString()}</strong>
            </p>
          )}

          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label>M-Pesa Phone Number</Label>
            <Input
              type="tel"
              placeholder="e.g. 0707874790"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label>Amount (KES)</Label>
            <Input
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              disabled={isProcessing}
            />
          </div>

          <p className="text-xs text-muted-foreground">5% commission will be deducted automatically</p>

          {/* Status display */}
          {statusMessage && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <StatusIcon />
              <span className="text-sm font-medium">{statusMessage}</span>
            </div>
          )}

          <Button
            onClick={handleStkPush}
            disabled={isProcessing || !phone || !amount || !name.trim()}
            className="w-full"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Smartphone className="h-4 w-4 mr-2" />
            )}
            {isProcessing ? "Processing..." : `Pay KES ${Number(amount || 0).toLocaleString()} via M-Pesa`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
