import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Smartphone, AlertCircle, CheckCircle, Loader2, Lock, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHOD_LIMITS } from "@/utils/paymentLimits";
import { PaymentChangeRequestForm } from "./PaymentChangeRequestForm";

interface PaymentMethodsManagerProps {
  userName: string;
  onUpdate?: () => void;
}

export const PaymentMethodsManager = ({ userName, onUpdate }: PaymentMethodsManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user phone
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setUserPhone(profile?.phone || null);

      // Check for pending payment change requests
      const { data: pendingRequests } = await supabase
        .from('customer_callbacks')
        .select('id')
        .ilike('question', '%Payment Method Change Request%')
        .eq('status', 'pending');

      setHasPendingRequest((pendingRequests?.length || 0) > 0);
    } catch (error: any) {
      console.error("Failed to load user data:", error);
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

      {/* Pending request notice */}
      {hasPendingRequest && (
        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <MessageSquare className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Change request pending</strong>
            <br />
            You have a pending payment method change request. Our team will contact you soon.
          </AlertDescription>
        </Alert>
      )}

      {/* Request change button */}
      {!hasPendingRequest && (
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => setShowChangeRequest(true)}
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Request Payment Number Change
        </Button>
      )}

      {/* Account holder info */}
      <div className="text-xs text-muted-foreground text-center pt-2">
        <p>Account holder: <strong>{userName}</strong></p>
        <p className="mt-1">All payouts will be sent to your registered M-Pesa number.</p>
      </div>

      {/* Change request form dialog */}
      <PaymentChangeRequestForm
        open={showChangeRequest}
        onClose={() => {
          setShowChangeRequest(false);
          fetchUserData(); // Refresh to check for new pending request
        }}
        currentPhone={userPhone}
        userName={userName}
      />
    </div>
  );
};
