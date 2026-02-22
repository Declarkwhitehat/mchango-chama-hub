import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface TwoFactorVerificationProps {
  userId: string;
  onVerified: () => void;
  onCancel: () => void;
}

export const TwoFactorVerification = ({ userId, onVerified, onCancel }: TwoFactorVerificationProps) => {
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

      const response = await fetch(`${supabaseUrl}/functions/v1/totp-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          action: 'verify-login',
          userId,
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

      onVerified();
    } catch (error) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
        <CardDescription>
          {useBackupCode
            ? "Enter one of your backup codes"
            : "Enter the 6-digit code from your authenticator app"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          {isVerifying ? "Verifying..." : "Verify"}
        </Button>

        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setCode("");
            }}
            className="text-xs"
          >
            {useBackupCode ? "Use authenticator code" : "Use backup code instead"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-xs text-muted-foreground"
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            Back to login
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
