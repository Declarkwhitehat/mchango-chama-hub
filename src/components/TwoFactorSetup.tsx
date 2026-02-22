import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, ShieldOff, Copy, Check, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TwoFactorSetupProps {
  isEnabled: boolean;
  onStatusChange: () => void;
}

export const TwoFactorSetup = ({ isEnabled, onStatusChange }: TwoFactorSetupProps) => {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauthUri: string;
    backupCodes: string[];
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [isDisabling, setIsDisabling] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [step, setStep] = useState<'idle' | 'scan' | 'verify' | 'backup'>('idle');

  const handleStartSetup = async () => {
    setIsSettingUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in first");
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/totp-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'setup' }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to start setup");
        return;
      }

      setSetupData(data);
      setStep('scan');
    } catch (error) {
      toast.error("Failed to start 2FA setup");
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerifySetup = async () => {
    if (!verifyCode || verifyCode.length !== 6) {
      toast.error("Enter a 6-digit code");
      return;
    }

    setIsVerifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/totp-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ action: 'verify-setup', token: verifyCode }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Invalid code");
        return;
      }

      toast.success("2FA enabled successfully!");
      setStep('backup');
    } catch (error) {
      toast.error("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!disableCode.trim()) {
      toast.error("Enter your 2FA code to disable");
      return;
    }

    setIsDisabling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/totp-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ action: 'disable', token: disableCode.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to disable 2FA");
        return;
      }

      toast.success("2FA disabled");
      setShowDisableDialog(false);
      setDisableCode("");
      onStatusChange();
    } catch (error) {
      toast.error("Failed to disable 2FA");
    } finally {
      setIsDisabling(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'secret' | 'codes') => {
    await navigator.clipboard.writeText(text);
    if (type === 'secret') {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
    toast.success("Copied to clipboard");
  };

  const handleDone = () => {
    setStep('idle');
    setSetupData(null);
    setVerifyCode("");
    onStatusChange();
  };

  // QR Code URL using a public API
  const qrCodeUrl = setupData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.otpauthUri)}`
    : '';

  if (step === 'scan' && setupData) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-3">
          <h3 className="font-semibold text-base">Step 1: Scan QR Code</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
          <div className="flex justify-center">
            <img src={qrCodeUrl} alt="2FA QR Code" className="rounded-lg border border-border" width={200} height={200} />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="mb-1">Or enter this key manually:</p>
            <div className="flex items-center justify-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-xs font-mono break-all">
                {setupData.secret}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(setupData.secret, 'secret')}
              >
                {copiedSecret ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
        <Button onClick={() => setStep('verify')} className="w-full">
          Next: Verify Code
        </Button>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-base">Step 2: Verify Setup</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Enter the 6-digit code shown in your authenticator app
          </p>
        </div>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="000000"
          value={verifyCode}
          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="text-center text-lg tracking-widest"
          onKeyDown={(e) => e.key === 'Enter' && handleVerifySetup()}
          autoFocus
        />
        <Button
          onClick={handleVerifySetup}
          disabled={isVerifying || verifyCode.length !== 6}
          className="w-full"
        >
          {isVerifying ? "Verifying..." : "Enable 2FA"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setStep('scan')} className="w-full text-xs">
          Back to QR Code
        </Button>
      </div>
    );
  }

  if (step === 'backup' && setupData) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <ShieldCheck className="h-8 w-8 text-green-500 mx-auto" />
          <h3 className="font-semibold text-base">2FA Enabled!</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Save these backup codes in a safe place. Each can be used once if you lose access to your authenticator.
          </p>
        </div>
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <div className="grid grid-cols-2 gap-1">
            {setupData.backupCodes.map((code, i) => (
              <code key={i} className="text-xs font-mono text-center py-1">{code}</code>
            ))}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => copyToClipboard(setupData.backupCodes.join('\n'), 'codes')}
        >
          {copiedCodes ? <Check className="mr-2 h-3 w-3" /> : <Copy className="mr-2 h-3 w-3" />}
          Copy Backup Codes
        </Button>
        <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            These codes won't be shown again. Save them now!
          </p>
        </div>
        <Button onClick={handleDone} className="w-full">Done</Button>
      </div>
    );
  }

  // Default idle state
  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-base sm:text-lg font-semibold">Two-Factor Authentication</h3>
        {isEnabled && (
          <Badge variant="default" className="bg-green-500 text-xs">Enabled</Badge>
        )}
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground">
        {isEnabled
          ? "Your account is protected with authenticator app 2FA."
          : "Add an extra layer of security using an authenticator app like Google Authenticator or Authy."
        }
      </p>

      {isEnabled ? (
        <Button
          variant="destructive"
          onClick={() => setShowDisableDialog(true)}
          className="w-full text-sm"
        >
          <ShieldOff className="mr-2 h-4 w-4" />
          Disable 2FA
        </Button>
      ) : (
        <Button
          onClick={handleStartSetup}
          disabled={isSettingUp}
          className="w-full text-sm"
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {isSettingUp ? "Setting up..." : "Enable 2FA"}
        </Button>
      )}

      {/* Disable 2FA Dialog */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Enter your current 2FA code or a backup code to disable two-factor authentication.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            placeholder="Enter 2FA code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            className="text-center tracking-widest"
            onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisableDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDisable} disabled={isDisabling}>
              {isDisabling ? "Disabling..." : "Disable 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
