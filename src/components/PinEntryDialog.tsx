import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PinRecoveryDialog } from "./PinRecoveryDialog";

interface PinEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  title?: string;
  description?: string;
}

export const PinEntryDialog = ({
  open,
  onOpenChange,
  onVerified,
  title = "Enter Your PIN",
  description = "Enter your 5-digit security PIN to continue.",
}: PinEntryDialogProps) => {
  const { session } = useAuth();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const handleVerify = async () => {
    if (pin.length !== 5) return;
    
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
        body: JSON.stringify({ action: 'verify-pin', pin }),
      });

      const data = await response.json();

      if (response.status === 429) {
        setLocked(true);
        setLockedUntil(data.locked_until);
        toast.error(data.error);
        return;
      }

      if (!response.ok) {
        setPin("");
        setRemainingAttempts(data.remaining_attempts ?? null);
        if (data.locked) {
          setLocked(true);
          toast.error("Account locked due to too many attempts. Use PIN recovery.");
        } else {
          toast.error(`Incorrect PIN. ${data.remaining_attempts ?? ''} attempts remaining.`);
        }
        return;
      }

      // Success
      setPin("");
      setRemainingAttempts(null);
      onVerified();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to verify PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySuccess = () => {
    setShowRecovery(false);
    setLocked(false);
    setRemainingAttempts(null);
    setPin("");
    toast.success("PIN reset successfully! Please enter your new PIN.");
  };

  if (showRecovery) {
    return (
      <PinRecoveryDialog
        open={showRecovery}
        onOpenChange={setShowRecovery}
        onSuccess={handleRecoverySuccess}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {locked ? (
            <div className="text-center space-y-3">
              <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm text-destructive font-medium">
                Account locked due to too many failed attempts.
              </p>
              <Button variant="outline" onClick={() => setShowRecovery(true)} className="w-full">
                Recover PIN
              </Button>
            </div>
          ) : (
            <>
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
              {remainingAttempts !== null && remainingAttempts <= 3 && (
                <p className="text-xs text-destructive text-center">
                  {remainingAttempts} attempt(s) remaining before lockout
                </p>
              )}
              <Button className="w-full" onClick={handleVerify} disabled={pin.length !== 5 || loading}>
                {loading ? "Verifying..." : "Verify PIN"}
              </Button>
              <Button variant="link" className="w-full text-sm" onClick={() => setShowRecovery(true)}>
                Forgot PIN?
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
