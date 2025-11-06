import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { sendOTP, verifyOTP } from "@/utils/smsService";
import { Loader2 } from "lucide-react";

interface PhoneVerificationProps {
  phone: string;
  onPhoneChange: (phone: string) => void;
  onVerified: () => void;
  userId?: string;
}

export const PhoneVerification = ({
  phone,
  onPhoneChange,
  onVerified,
  userId,
}: PhoneVerificationProps) => {
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

  const handleSendOTP = async () => {
    if (!phone || !/^\+\d{10,15}$/.test(phone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number in international format (e.g., +254712345678)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const result = await sendOTP(phone);
    setLoading(false);

    if (result.success) {
      setOtpSent(true);
      setCountdown(300); // 5 minutes countdown
      
      // Start countdown timer
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast({
        title: "OTP Sent",
        description: "Please check your phone for the verification code.",
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast({
        title: "Invalid OTP",
        description: "Please enter a 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const result = await verifyOTP(phone, otp, userId);
    setLoading(false);

    if (result.success) {
      toast({
        title: "Success",
        description: "Phone number verified successfully!",
      });
      onVerified();
    } else {
      toast({
        title: "Verification Failed",
        description: result.error || "Invalid OTP. Please try again.",
        variant: "destructive",
      });
      setOtp("");
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <div className="flex gap-2">
          <Input
            id="phone"
            type="tel"
            placeholder="+254712345678"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            disabled={otpSent}
            className="flex-1"
          />
          {!otpSent && (
            <Button
              type="button"
              onClick={handleSendOTP}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send OTP"
              )}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Enter phone number in international format (e.g., +254712345678)
        </p>
      </div>

      {otpSent && (
        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification Code</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={(value) => setOtp(value)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            {countdown > 0 && (
              <p className="text-sm text-center text-muted-foreground">
                Code expires in {formatCountdown(countdown)}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleVerifyOTP}
              disabled={loading || otp.length !== 6}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </Button>
            {countdown === 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  handleSendOTP();
                }}
                disabled={loading}
              >
                Resend
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
