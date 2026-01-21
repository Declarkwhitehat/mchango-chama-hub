import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Smartphone, AlertCircle, CheckCircle, Loader2, Lock, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHOD_LIMITS } from "@/utils/paymentLimits";

interface PaymentMethodsManagerProps {
  userName: string;
  onUpdate?: () => void;
}

export const PaymentMethodsManager = ({ userName, onUpdate }: PaymentMethodsManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [userPhone, setUserPhone] = useState<string | null>(null);

  useEffect(() => {
    fetchUserPhone();
  }, []);

  const fetchUserPhone = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserPhone(profile?.phone || null);
    } catch (error: any) {
      console.error("Failed to load user phone:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Transaction Limits Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Daily Transaction Limit:</strong> M-Pesa: KES {PAYMENT_METHOD_LIMITS.mpesa.daily_limit.toLocaleString()}
        </AlertDescription>
      </Alert>

      {/* Fixed Payment Method */}
      <Card className="relative border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                <Smartphone className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">M-Pesa (Safaricom)</p>
                  <Badge variant="secondary" className="text-xs">Default</Badge>
                  <Badge variant="default" className="text-xs bg-green-500">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                </div>
                <p className="text-sm font-medium">
                  {userPhone || "Phone not set"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Daily Limit: KES {PAYMENT_METHOD_LIMITS.mpesa.daily_limit.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lock className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info about changing payment method */}
      <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <Phone className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Need to change your payment number?</strong>
          <br />
          Your payout number is linked to your registration phone for security. 
          To change it, please contact our customer support team.
        </AlertDescription>
      </Alert>

      {/* Account holder info */}
      <div className="text-xs text-muted-foreground text-center pt-2">
        <p>Account holder: <strong>{userName}</strong></p>
        <p className="mt-1">All payouts will be sent to your registered M-Pesa number.</p>
      </div>
    </div>
  );
};
