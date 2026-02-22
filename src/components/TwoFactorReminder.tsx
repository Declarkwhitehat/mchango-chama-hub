import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldAlert, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

export const TwoFactorReminder = () => {
  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check2FA = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/totp-2fa`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await response.json();
        setIs2FAEnabled(data.enabled || false);
      } catch {
        setIs2FAEnabled(null);
      }
    };
    check2FA();
  }, []);

  // Check sessionStorage for dismissal
  useEffect(() => {
    const wasDismissed = sessionStorage.getItem('2fa_reminder_dismissed');
    if (wasDismissed) setDismissed(true);
  }, []);

  if (is2FAEnabled !== false || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('2fa_reminder_dismissed', 'true');
  };

  return (
    <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 relative">
      <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="text-sm text-amber-800 dark:text-amber-200 pr-8">
        <strong>Secure your account!</strong> Two-factor authentication (2FA) is not enabled. 
        We strongly recommend setting it up to protect your account and transactions.
        <Link to="/profile" className="inline-flex items-center gap-1 ml-2 font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">
          Set up 2FA <ArrowRight className="h-3 w-3" />
        </Link>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900/30"
        onClick={handleDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </Alert>
  );
};
