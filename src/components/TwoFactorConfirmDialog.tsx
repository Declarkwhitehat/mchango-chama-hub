import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";
import { toast } from "sonner";

interface TwoFactorConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
  title?: string;
  description?: string;
}

export const TwoFactorConfirmDialog = ({
  open,
  onOpenChange,
  onConfirmed,
  title = "Verify Identity",
  description = "Enter your 2FA code to continue",
}: TwoFactorConfirmDialogProps) => {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleVerify = async () => {
    if (!code.trim()) {
      toast.error("Please enter a code");
      return;
    }

    setIsVerifying(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Get current session for authenticated verification
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Session expired. Please log in again.");
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/totp-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'verify-login',
          userId: session.user.id,
          token: code.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.verified) {
        toast.error(data.error || "Invalid code. Please try again.");
        return;
      }

      if (data.backupCodeUsed) {
        toast.warning(`Backup code used. ${data.remainingBackupCodes} remaining.`);
      }

      setCode("");
      onOpenChange(false);
      onConfirmed();
    } catch (error) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setCode(""); onOpenChange(v); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>
            {useBackupCode
              ? "Enter one of your backup codes"
              : description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="text"
            inputMode={useBackupCode ? "text" : "numeric"}
            placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={useBackupCode ? 9 : 6}
            className="text-center text-lg tracking-widest"
            onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
            autoFocus
          />

          <Button
            onClick={handleVerify}
            disabled={isVerifying || !code.trim()}
            className="w-full"
          >
            {isVerifying ? "Verifying..." : "Verify & Continue"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setCode("");
            }}
            className="w-full text-xs"
          >
            {useBackupCode ? "Use authenticator code" : "Use backup code instead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
