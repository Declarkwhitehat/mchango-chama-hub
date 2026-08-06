import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Lock } from "lucide-react";
import { toast } from "sonner";

const PinSetup = () => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (pin.length !== 5) {
      toast.error("PIN must be exactly 5 digits");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

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
        body: JSON.stringify({ action: 'set-pin', pin }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'Failed to set PIN');
        return;
      }

      toast.success("PIN set successfully!");
      const returnTo = sessionStorage.getItem('pinSetupReturnTo');
      sessionStorage.removeItem('pinSetupReturnTo');
      navigate(returnTo || '/kyc-upload', { replace: true });
    } catch (err) {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Set Up Security PIN</CardTitle>
          <CardDescription>
            Create a 5-digit PIN to secure your account. This PIN will be required for login and sensitive actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Lock className="h-4 w-4" /> Enter 5-Digit PIN
              </Label>
              <div className="flex justify-center">
                <InputOTP maxLength={5} value={pin} onChange={setPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm PIN</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={5} value={confirmPin} onChange={setConfirmPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={loading || pin.length !== 5 || confirmPin.length !== 5}
            >
              {loading ? "Setting up..." : "Complete Setup"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PinSetup;
