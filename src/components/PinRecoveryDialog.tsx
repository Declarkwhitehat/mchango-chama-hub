import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, Phone, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface PinRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface UserQuestion {
  question_id: string;
  question_text: string;
}

export const PinRecoveryDialog = ({ open, onOpenChange, onSuccess }: PinRecoveryDialogProps) => {
  const { session, profile } = useAuth();
  const [method, setMethod] = useState<"questions" | "otp">("questions");
  const [userQuestions, setUserQuestions] = useState<UserQuestion[]>([]);
  const [securityAnswers, setSecurityAnswers] = useState<string[]>(["", "", ""]);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);

  useEffect(() => {
    if (open) fetchUserQuestions();
  }, [open]);

  const fetchUserQuestions = async () => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/pin-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: 'get-user-security-questions' }),
      });
      const data = await response.json();
      setUserQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to fetch user questions:', err);
    }
  };

  const handleSecurityReset = async () => {
    if (newPin.length !== 5) { toast.error("New PIN must be 5 digits"); return; }
    if (newPin !== confirmNewPin) { toast.error("PINs do not match"); return; }
    if (securityAnswers.some(a => !a.trim())) { toast.error("All answers required"); return; }

    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/pin-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: 'reset-pin-security-questions',
          answers: userQuestions.map((q, i) => ({
            question_id: q.question_id,
            answer: securityAnswers[i],
          })),
          new_pin: newPin,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Security answers incorrect");
        return;
      }
      onSuccess();
    } catch (err) {
      toast.error("Failed to reset PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!profile?.phone) { toast.error("No phone number on file"); return; }
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ phone: profile.phone }),
      });
      setOtpSent(true);
      toast.success(`OTP sent to ${profile.phone.slice(0, 7)}****`);
    } catch (err) {
      toast.error("Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ phone: profile?.phone, otp }),
      });
      const data = await response.json();
      if (!response.ok || !data.verified) {
        toast.error("Invalid OTP");
        return;
      }
      setOtpVerified(true);
      toast.success("OTP verified! Set your new PIN.");
    } catch (err) {
      toast.error("Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpPinReset = async () => {
    if (newPin.length !== 5) { toast.error("New PIN must be 5 digits"); return; }
    if (newPin !== confirmNewPin) { toast.error("PINs do not match"); return; }

    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/pin-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: 'reset-pin-otp', new_pin: newPin }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to reset PIN");
        return;
      }
      onSuccess();
    } catch (err) {
      toast.error("Failed to reset PIN");
    } finally {
      setLoading(false);
    }
  };

  const maskedPhone = profile?.phone ? `${profile.phone.slice(0, 7)}****${profile.phone.slice(-2)}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" /> Recover Your PIN
          </DialogTitle>
          <DialogDescription>
            Choose a recovery method to reset your PIN.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="questions" className="text-xs">
              <HelpCircle className="h-3.5 w-3.5 mr-1" /> Security Questions
            </TabsTrigger>
            <TabsTrigger value="otp" className="text-xs">
              <Phone className="h-3.5 w-3.5 mr-1" /> Phone OTP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="questions" className="space-y-3 mt-3">
            {userQuestions.map((q, i) => (
              <div key={q.question_id} className="space-y-1">
                <Label className="text-xs">{q.question_text}</Label>
                <Input
                  placeholder="Your answer"
                  value={securityAnswers[i]}
                  onChange={(e) => {
                    const updated = [...securityAnswers];
                    updated[i] = e.target.value;
                    setSecurityAnswers(updated);
                  }}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">New 5-Digit PIN</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={5} value={newPin} onChange={setNewPin}>
                  <InputOTPGroup>
                    {[0,1,2,3,4].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirm New PIN</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={5} value={confirmNewPin} onChange={setConfirmNewPin}>
                  <InputOTPGroup>
                    {[0,1,2,3,4].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <Button className="w-full" onClick={handleSecurityReset} disabled={loading}>
              {loading ? "Resetting..." : "Reset PIN"}
            </Button>
          </TabsContent>

          <TabsContent value="otp" className="space-y-3 mt-3">
            {!otpSent ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  We'll send a verification code to your registered phone: <strong>{maskedPhone}</strong>
                </p>
                <Button className="w-full" onClick={handleSendOtp} disabled={loading}>
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
              </div>
            ) : !otpVerified ? (
              <div className="space-y-3">
                <Label className="text-xs">Enter 6-digit OTP</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button className="w-full" onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}>
                  {loading ? "Verifying..." : "Verify OTP"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">New 5-Digit PIN</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={5} value={newPin} onChange={setNewPin}>
                      <InputOTPGroup>
                        {[0,1,2,3,4].map(i => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Confirm New PIN</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={5} value={confirmNewPin} onChange={setConfirmNewPin}>
                      <InputOTPGroup>
                        {[0,1,2,3,4].map(i => <InputOTPSlot key={i} index={i} />)}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <Button className="w-full" onClick={handleOtpPinReset} disabled={loading}>
                  {loading ? "Resetting..." : "Reset PIN"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
