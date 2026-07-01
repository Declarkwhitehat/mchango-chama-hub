import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, TrendingUp, ShieldCheck, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userPhone: string | null;
}

interface RequestRow {
  id: string;
  requested_limit: number;
  status: string;
  admin_notes: string | null;
  expires_at: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export const DailyLimitIncreaseCard = ({ userPhone }: Props) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>("300000");
  const [reason, setReason] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [latest, setLatest] = useState<RequestRow | null>(null);
  const [customLimit, setCustomLimit] = useState<number | null>(null);
  const [customExpiry, setCustomExpiry] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const sb = supabase as any;
    const [{ data: reqs }, { data: prof }] = await Promise.all([
      sb.from("daily_limit_increase_requests")
        .select("id,requested_limit,status,admin_notes,expires_at,created_at,reviewed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1),
      sb.from("profiles")
        .select("custom_daily_limit,custom_daily_limit_expires_at")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    setLatest((reqs?.[0] as RequestRow) ?? null);
    const expiry = (prof as any)?.custom_daily_limit_expires_at ?? null;
    const active = expiry ? new Date(expiry).getTime() > Date.now() : !!(prof as any)?.custom_daily_limit;
    setCustomLimit(active ? Number((prof as any)?.custom_daily_limit) : null);
    setCustomExpiry(active ? expiry : null);
  }, []);

  useEffect(() => { load(); }, [load]);

  const effectiveLimit = customLimit ?? 150000;
  const hasPending = latest?.status === "pending";

  const handleSendOtp = async () => {
    if (!userPhone) {
      toast.error("No phone on file");
      return;
    }
    setSendingOtp(true);
    try {
      const { error } = await supabase.functions.invoke("send-otp", {
        body: { phone: userPhone, purpose: "daily_limit_increase" },
      });
      if (error) throw error;
      setOtpSent(true);
      toast.success("OTP sent to your phone");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async (otpCode?: string) => {
    const code = otpCode ?? otp;
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested < 150000 || requested > 500000) {
      toast.error("Enter an amount between 150,000 and 500,000");
      return;
    }
    if (reason.trim().length < 20) {
      toast.error("Please provide a reason (at least 20 characters)");
      return;
    }
    if (!code || code.length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-daily-limit-increase", {
        body: { requested_limit: requested, reason: reason.trim(), phone: userPhone, otp: code },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Request submitted. Admin will review shortly.");
      setOpen(false);
      setReason(""); setOtp(""); setOtpSent(false);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const resetDialog = () => { setReason(""); setOtp(""); setOtpSent(false); };

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
        <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Daily Payout Limit
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Request a temporary increase from KES 150,000 up to KES 500,000 per day.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
          <div>
            <p className="text-xs text-muted-foreground">Current daily limit</p>
            <p className="text-lg font-semibold">KES {effectiveLimit.toLocaleString()}</p>
            {customExpiry && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Expires {new Date(customExpiry).toLocaleDateString()}
              </p>
            )}
          </div>
          {customLimit && (
            <Badge className="bg-blue-500">
              <ShieldCheck className="h-3 w-3 mr-1" /> Increased
            </Badge>
          )}
        </div>

        {latest && (
          <div className="p-3 rounded-lg border text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last request</span>
              <Badge variant={
                latest.status === "approved" ? "default" :
                latest.status === "rejected" ? "destructive" : "secondary"
              }>
                {latest.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                {latest.status}
              </Badge>
            </div>
            <p className="mt-1">KES {Number(latest.requested_limit).toLocaleString()} — {new Date(latest.created_at).toLocaleDateString()}</p>
            {latest.admin_notes && (
              <p className="text-xs text-muted-foreground mt-1">Note: {latest.admin_notes}</p>
            )}
          </div>
        )}

        <Button
          className="w-full"
          disabled={hasPending}
          onClick={() => { resetDialog(); setOpen(true); }}
        >
          {hasPending ? "Request under review" : "Request Limit Increase"}
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Daily Limit Increase</DialogTitle>
            <DialogDescription>
              Verify with a one-time code sent to {userPhone ?? "your phone"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Requested daily limit (KES)</Label>
              <Input
                type="number"
                min={150000}
                max={500000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Between 150,000 and 500,000</p>
            </div>

            <div className="space-y-1.5">
              <Label>Why do you need this increase?</Label>
              <Textarea
                rows={3}
                maxLength={500}
                placeholder="Explain your use case (min 20 characters)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground text-right">{reason.length}/500</p>
            </div>

            {!otpSent ? (
              <Button variant="outline" className="w-full" onClick={handleSendOtp} disabled={sendingOtp || !userPhone}>
                {sendingOtp && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send OTP
              </Button>
            ) : (
              <div className="space-y-1.5">
                <Label>Enter OTP to submit</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otp}
                  disabled={submitting}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setOtp(v);
                    if (v.length === 6 && !submitting) {
                      handleSubmit(v);
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">Your request is sent automatically once you enter all 6 digits.</p>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={handleSendOtp} disabled={sendingOtp || submitting}>
                  Resend OTP
                </Button>
              </div>
            )}

            <Alert>
              <AlertDescription className="text-xs">
                Admin will review your history and decide. You'll be notified by SMS.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={submitting}>
                {submitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>) : "Cancel"}
              </Button>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
