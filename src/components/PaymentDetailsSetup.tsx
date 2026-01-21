import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, Smartphone, Shield } from "lucide-react";
import { PAYMENT_METHOD_LIMITS } from "@/utils/paymentLimits";

export const PaymentDetailsSetup = ({ open, onComplete }: { open: boolean; onComplete: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchUserProfile();
    }
  }, [open]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserPhone(profile?.phone || null);
      setUserName(profile?.full_name || "");
    } catch (error: any) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!userPhone) {
      toast({
        title: "Phone Number Required",
        description: "Your profile is missing a phone number. Please update your profile first.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      // Mark payment details as completed
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ payment_details_completed: true })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Payment Setup Complete",
        description: "Your M-Pesa number has been set as your payout method.",
      });

      onComplete();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete setup",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Confirm Payment Details</DialogTitle>
          <DialogDescription>
            Your registered phone number will be used for all payouts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Payment Method Display */}
              <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <Smartphone className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">M-Pesa (Safaricom)</p>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                    <p className="text-lg font-medium text-primary">
                      {userPhone || "No phone number"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Daily Limit: KES {PAYMENT_METHOD_LIMITS.mpesa.daily_limit.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Account holder */}
              <div className="text-center text-sm text-muted-foreground">
                <p>Account holder: <strong>{userName}</strong></p>
              </div>

              {/* Security note */}
              <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                <Shield className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                  For your security, payouts are only sent to your registered phone number. 
                  Contact customer support if you need to change it.
                </AlertDescription>
              </Alert>

              {/* Confirm Button */}
              <Button 
                onClick={handleComplete} 
                disabled={loading || !userPhone} 
                className="w-full"
                size="lg"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Continue
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
