import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Wallet, Loader2, Clock, AlertCircle, Smartphone, Building2 } from "lucide-react";
import { PAYMENT_METHOD_LIMITS, type PaymentMethodType } from "@/utils/paymentLimits";

interface WithdrawalButtonProps {
  chamaId?: string;
  mchangoId?: string;
  totalAvailable: number;
  commissionRate: number;
  onSuccess?: () => void;
}

export const WithdrawalButton = ({ 
  chamaId, 
  mchangoId, 
  totalAvailable, 
  commissionRate,
  onSuccess 
}: WithdrawalButtonProps) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<any>(null);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<any>(null);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [loadingPaymentMethod, setLoadingPaymentMethod] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadPendingWithdrawal();
      loadPaymentMethod();
      loadDailyUsage();
    }
  }, [isOpen, chamaId, mchangoId]);

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('withdrawals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals',
          filter: chamaId ? `chama_id=eq.${chamaId}` : `mchango_id=eq.${mchangoId}`
        },
        () => {
          console.log('Withdrawal status changed, reloading...');
          loadPendingWithdrawal();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chamaId, mchangoId]);

  const loadPendingWithdrawal = async () => {
    try {
      const query = supabase
        .from('withdrawals')
        .select('*')
        .eq('status', 'pending');

      if (chamaId) {
        query.eq('chama_id', chamaId);
      } else if (mchangoId) {
        query.eq('mchango_id', mchangoId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      setPendingWithdrawal(data);
    } catch (error: any) {
      console.error("Error loading pending withdrawal:", error);
    }
  };

  const loadPaymentMethod = async () => {
    try {
      setLoadingPaymentMethod(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();

      if (error) throw error;
      setDefaultPaymentMethod(data);
    } catch (error: any) {
      console.error("Error loading payment method:", error);
    } finally {
      setLoadingPaymentMethod(false);
    }
  };

  const loadDailyUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: paymentMethod } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();

      if (!paymentMethod) return;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('withdrawals')
        .select('net_amount')
        .eq('payment_method_id', paymentMethod.id)
        .in('status', ['pending', 'completed'])
        .gte('requested_at', todayStart.toISOString());

      const total = data?.reduce((sum, w) => sum + Number(w.net_amount), 0) || 0;
      setDailyUsed(total);
    } catch (error: any) {
      console.error("Error loading daily usage:", error);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid withdrawal amount",
        variant: "destructive",
      });
      return;
    }

    if (parseFloat(amount) > totalAvailable) {
      toast({
        title: "Insufficient Funds",
        description: `Available balance is KES ${totalAvailable.toLocaleString()}`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Session Expired",
          description: "Please log in again to request a withdrawal",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke('withdrawals-crud', {
        body: {
          chama_id: chamaId,
          mchango_id: mchangoId,
          amount: parseFloat(amount),
          notes: notes || null,
        },
        method: 'POST'
      });

      if (error) throw error;

      const commission = parseFloat(amount) * commissionRate;
      const netAmount = parseFloat(amount) - commission;

      toast({
        title: "Withdrawal Requested",
        description: `You will receive KES ${netAmount.toLocaleString()} (after KES ${commission.toLocaleString()} commission) once approved by admin`,
      });

      setAmount("");
      setNotes("");
      setIsOpen(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      
      // Parse error message for limit exceeded cases
      let errorMessage = error.message || "Failed to create withdrawal request";
      
      toast({
        title: "Withdrawal Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const commissionAmount = parseFloat(amount || "0") * commissionRate;
  const netAmount = parseFloat(amount || "0") - commissionAmount;

  const dailyLimit = defaultPaymentMethod 
    ? PAYMENT_METHOD_LIMITS[defaultPaymentMethod.method_type as PaymentMethodType]?.daily_limit || 0
    : 0;
  
  const remainingLimit = Math.max(0, dailyLimit - dailyUsed);

  const getPaymentIcon = (type: string) => {
    if (type === 'mpesa' || type === 'airtel_money') {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Building2 className="h-4 w-4" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="hero" className="w-full">
          <Wallet className="h-4 w-4 mr-2" />
          Withdraw Funds
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw Funds</DialogTitle>
          <DialogDescription>
            Request to withdraw funds from your {chamaId ? 'chama' : 'mchango'}
          </DialogDescription>
        </DialogHeader>

        {!defaultPaymentMethod && !loadingPaymentMethod ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Payment Method Required</AlertTitle>
            <AlertDescription>
              Please add a default payment method in your profile to request withdrawals.
              <Button 
                variant="link" 
                className="p-0 h-auto ml-1"
                onClick={() => navigate('/profile')}
              >
                Configure Now
              </Button>
            </AlertDescription>
          </Alert>
        ) : pendingWithdrawal ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-yellow-500" />
                Withdrawal Pending
              </CardTitle>
              <CardDescription>
                Your withdrawal request is awaiting admin approval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Requested Amount</p>
                <p className="text-2xl font-bold">
                  KES {Number(pendingWithdrawal.amount).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">You'll Receive (after commission)</p>
                <p className="text-xl font-semibold text-green-600">
                  KES {Number(pendingWithdrawal.net_amount).toLocaleString()}
                </p>
              </div>
              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Requested on {new Date(pendingWithdrawal.requested_at).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleWithdraw} className="space-y-4">
            {defaultPaymentMethod && (
              <Card className="bg-muted/30">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getPaymentIcon(defaultPaymentMethod.method_type)}
                      <div>
                        <p className="text-sm font-medium">
                          {PAYMENT_METHOD_LIMITS[defaultPaymentMethod.method_type as PaymentMethodType]?.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {defaultPaymentMethod.phone_number || 
                           `${defaultPaymentMethod.bank_name} - ***${defaultPaymentMethod.account_number?.slice(-4)}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">Default</Badge>
                  </div>
                  <div className="pt-2 border-t space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Daily Limit</span>
                      <span className="font-medium">KES {dailyLimit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Used Today</span>
                      <span className="font-medium">KES {dailyUsed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Available Today</span>
                      <span className="text-green-600">KES {remainingLimit.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Available Balance</Label>
              <p className="text-2xl font-bold text-foreground">
                KES {totalAvailable.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Withdrawal Amount (KES)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                max={totalAvailable}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
              />
            </div>

            {parseFloat(amount || "0") > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Commission ({(commissionRate * 100).toFixed(1)}%)</span>
                    <span className="font-medium text-destructive">
                      - KES {commissionAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>You'll Receive</span>
                    <span className="text-green-600">
                      KES {netAmount.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this withdrawal..."
                rows={2}
              />
            </div>

            {netAmount > remainingLimit && remainingLimit > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This withdrawal exceeds your remaining daily limit. You can withdraw up to KES {remainingLimit.toLocaleString()} more today.
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              disabled={isLoading || !defaultPaymentMethod || netAmount > remainingLimit} 
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Requesting...
                </>
              ) : (
                `Request Withdrawal`
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};