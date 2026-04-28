import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Wallet, Clock, CheckCircle, XCircle, Loader2, Smartphone, Building2 } from "lucide-react";
// realtime subscription removed in favor of 30s polling
import { formatPaymentMethodLabel } from "@/utils/paymentLimits";

interface WithdrawalHistoryProps {
  chamaId?: string;
  mchangoId?: string;
  organizationId?: string;
}

export const WithdrawalHistory = ({ chamaId, mchangoId, organizationId }: WithdrawalHistoryProps) => {
  const navigate = useNavigate();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWithdrawals();

    // Poll every 30s instead of realtime subscription
    const interval = setInterval(() => loadWithdrawals(true), 30000);

    return () => {
      clearInterval(interval);
    };
  }, [chamaId, mchangoId, organizationId]);

  const loadWithdrawals = async (isBackgroundRefetch = false) => {
    try {
      if (!isBackgroundRefetch) setIsLoading(true);

      // Use direct Supabase query - fetch withdrawals only
      let query = supabase
        .from('withdrawals')
        .select('*')
        .order('requested_at', { ascending: false });

      if (chamaId) {
        query = query.eq('chama_id', chamaId);
      }
      if (mchangoId) {
        query = query.eq('mchango_id', mchangoId);
      }
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading withdrawals:", error);
        toast({
          title: "Failed to Load Withdrawals",
          description: error.message || "Could not retrieve withdrawal history",
          variant: "destructive",
        });
        setWithdrawals([]);
      } else {
        setWithdrawals(data || []);
      }
    } catch (error: any) {
      console.error("Error loading withdrawals:", error);
      if (!isBackgroundRefetch) {
        toast({
          title: "Error",
          description: "An unexpected error occurred while loading withdrawals",
          variant: "destructive",
        });
        setWithdrawals([]);
      }
    } finally {
      if (!isBackgroundRefetch) setIsLoading(false);
    }
  };
      console.error("Error loading withdrawals:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while loading withdrawals",
        variant: "destructive",
      });
      setWithdrawals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending Approval</Badge>;
      case 'approved':
        return <Badge variant="default" className="gap-1 bg-blue-500"><CheckCircle className="h-3 w-3" />Approved</Badge>;
      case 'completed':
        return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle className="h-3 w-3" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (withdrawals.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Withdrawal History
        </CardTitle>
        <CardDescription>Past withdrawal requests and their status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {withdrawals.map((withdrawal) => (
            <div 
              key={withdrawal.id} 
              className="p-4 border rounded-lg bg-muted/20 space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-lg">
                    KES {Number(withdrawal.amount).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Net: KES {Number(withdrawal.net_amount).toLocaleString()}
                  </p>
                </div>
                {getStatusBadge(withdrawal.status)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Requested</p>
                  <p className="font-medium">
                    {formatDate(withdrawal.requested_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(withdrawal.requested_at).toLocaleTimeString()}
                  </p>
                </div>

                {withdrawal.reviewed_at && (
                  <div>
                    <p className="text-muted-foreground">Reviewed</p>
                    <p className="font-medium">
                      {formatDate(withdrawal.reviewed_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(withdrawal.reviewed_at).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>

              {withdrawal.payment_reference && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Payment Reference</p>
                  <p className="font-medium text-sm">{withdrawal.payment_reference}</p>
                </div>
              )}

              {withdrawal.rejection_reason && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Rejection Reason</p>
                  <p className="text-sm text-destructive">{withdrawal.rejection_reason}</p>
                </div>
              )}

              {withdrawal.payment_method_type && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Payment Method</p>
                  <div className="flex items-center gap-2 mt-1">
                    {withdrawal.payment_method_type === 'bank_account' ? (
                      <Building2 className="h-3 w-3" />
                    ) : (
                      <Smartphone className="h-3 w-3" />
                    )}
                    <p className="text-sm font-medium">
                      {formatPaymentMethodLabel(withdrawal.payment_method_type)}
                    </p>
                  </div>
                </div>
              )}

              {withdrawal.notes && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{withdrawal.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};