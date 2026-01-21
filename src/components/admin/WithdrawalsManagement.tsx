import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Wallet, Clock, CheckCircle, XCircle, Loader2, ArrowRightLeft, Send, Banknote } from "lucide-react";
import { WithdrawalMemberAnalytics } from "./WithdrawalMemberAnalytics";

interface MemberAnalytics {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  missed_payments_count: number;
  late_payments_count: number;
  on_time_payments_count: number;
  on_time_rate: number;
  total_contributed: number;
  expected_contributions: number;
  balance_deficit: number;
  balance_credit: number;
  skip_history: any[];
  payout_position: number;
  risk_level: 'low' | 'medium' | 'high';
  first_payment_completed: boolean;
  joined_at: string;
}

interface NextEligibleMember {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  on_time_rate: number;
  risk_level: 'low' | 'medium' | 'high';
}

export const WithdrawalsManagement = () => {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [skipToNext, setSkipToNext] = useState(true);
  const [memberAnalytics, setMemberAnalytics] = useState<MemberAnalytics | null>(null);
  const [nextEligible, setNextEligible] = useState<NextEligibleMember | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    loadWithdrawals();

    // Set up realtime subscription
    const channel = supabase
      .channel('admin-withdrawals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals'
        },
        () => {
          console.log('Withdrawal changed, reloading...');
          loadWithdrawals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWithdrawals = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error("No session found");
        return;
      }

      const { data, error } = await supabase.functions.invoke('withdrawals-crud', {
        method: 'GET'
      });

      if (error) throw error;

      setWithdrawals(data.data || []);
    } catch (error: any) {
      console.error("Error loading withdrawals:", error);
      toast({
        title: "Error",
        description: "Failed to load withdrawals",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const closeDialog = () => {
    setSelectedWithdrawal(null);
    setPaymentReference("");
    setRejectionReason("");
    setSkipToNext(true);
    setMemberAnalytics(null);
    setNextEligible(null);
    setActiveTab("details");
  };

  // Send via M-Pesa (triggers B2C payout)
  const handleSendViaMpesa = async () => {
    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Authentication required",
          description: "Please log in as admin",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.functions.invoke('withdrawals-crud', {
        method: 'PATCH',
        body: {
          withdrawal_id: selectedWithdrawal.id,
          status: 'approved',
          // No payment_reference - signals B2C payout
        }
      });

      if (error) throw error;

      toast({
        title: "M-Pesa Payout Initiated",
        description: "Money is being sent to the member's M-Pesa. The withdrawal will be marked complete automatically.",
      });

      closeDialog();
    } catch (error: any) {
      console.error("Error sending via M-Pesa:", error);
      toast({
        title: "Error",
        description: "Failed to initiate M-Pesa payout",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Mark as manually paid (requires payment reference)
  const handleMarkAsManuallyPaid = async () => {
    if (!paymentReference) {
      toast({
        title: "Error",
        description: "Please enter the payment reference",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Authentication required",
          description: "Please log in as admin",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.functions.invoke('withdrawals-crud', {
        method: 'PATCH',
        body: {
          withdrawal_id: selectedWithdrawal.id,
          status: 'completed',
          payment_reference: paymentReference,
        }
      });

      if (error) throw error;

      toast({
        title: "Withdrawal Completed",
        description: "Withdrawal marked as manually paid",
      });

      closeDialog();
    } catch (error: any) {
      console.error("Error marking as paid:", error);
      toast({
        title: "Error",
        description: "Failed to complete withdrawal",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason) {
      toast({
        title: "Error",
        description: "Please enter rejection reason",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Authentication required",
          description: "Please log in as admin",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('withdrawals-crud', {
        method: 'PATCH',
        body: {
          withdrawal_id: selectedWithdrawal.id,
          status: 'rejected',
          rejection_reason: rejectionReason,
          skip_to_next: skipToNext && selectedWithdrawal.chama_id
        }
      });

      if (error) throw error;

      toast({
        title: "Withdrawal Rejected",
        description: data?.swapped 
          ? "Positions swapped and next eligible member will receive payout."
          : "Withdrawal rejected",
      });

      closeDialog();
    } catch (error: any) {
      console.error("Error rejecting withdrawal:", error);
      toast({
        title: "Error",
        description: "Failed to reject withdrawal",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadMemberAnalytics = async (withdrawal: any) => {
    if (!withdrawal.chama_id) return;
    
    setIsLoadingAnalytics(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/withdrawal-member-analytics?chama_id=${withdrawal.chama_id}&withdrawal_id=${withdrawal.id}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        setMemberAnalytics(result.member_analytics);
        setNextEligible(result.next_eligible_member);
      }
    } catch (error) {
      console.error('Error loading member analytics:', error);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const handleSelectWithdrawal = (withdrawal: any) => {
    setSelectedWithdrawal(withdrawal);
    setActiveTab("details");
    setPaymentReference("");
    setRejectionReason("");
    setSkipToNext(true);
    setMemberAnalytics(null);
    setNextEligible(null);
    
    // Load analytics for chama withdrawals
    if (withdrawal.chama_id) {
      loadMemberAnalytics(withdrawal);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case 'approved':
        return <Badge className="gap-1 bg-primary text-primary-foreground"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
      case 'completed':
        return <Badge className="gap-1 bg-accent text-accent-foreground"><CheckCircle className="h-3 w-3" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
      case 'pending_retry':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Retrying</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const isMpesaPayment = selectedWithdrawal?.payment_method?.method_type === 'mpesa';

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Withdrawal Requests
          </CardTitle>
          <CardDescription>Review and approve withdrawal requests</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Net Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No withdrawal requests
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      {new Date(withdrawal.requested_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{withdrawal.requester?.full_name || 'Unknown'}</TableCell>
                    <TableCell>
                      {withdrawal.chama_id ? 'Chama' : 'Mchango'}
                    </TableCell>
                    <TableCell className="font-medium">
                      KES {Number(withdrawal.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold text-primary">
                      KES {Number(withdrawal.net_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                    <TableCell>
                      {withdrawal.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => handleSelectWithdrawal(withdrawal)}
                        >
                          Review
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Withdrawal Request</DialogTitle>
            <DialogDescription>
              Review member payment history and approve or reject
            </DialogDescription>
          </DialogHeader>

          {selectedWithdrawal && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Withdrawal Details</TabsTrigger>
                <TabsTrigger value="analytics" disabled={!selectedWithdrawal.chama_id}>
                  Payment Analytics
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Requester</Label>
                    <p className="font-medium">{selectedWithdrawal.requester?.full_name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Type</Label>
                    <p className="font-medium">
                      {selectedWithdrawal.chama_id ? 'Chama' : 'Mchango'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Amount</Label>
                    <p className="text-xl font-bold">
                      KES {Number(selectedWithdrawal.amount).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Net Payment</Label>
                    <p className="text-xl font-bold text-primary">
                      KES {Number(selectedWithdrawal.net_amount).toLocaleString()}
                    </p>
                  </div>
                </div>

                {selectedWithdrawal.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="text-sm mt-1 p-2 bg-muted rounded">{selectedWithdrawal.notes}</p>
                  </div>
                )}

                {/* Payment Method Info */}
                {selectedWithdrawal.payment_method && (
                  <div className="p-3 bg-muted rounded-lg">
                    <Label className="text-muted-foreground">Payment Method</Label>
                    <p className="font-medium capitalize">
                      {selectedWithdrawal.payment_method.method_type?.replace('_', ' ')}
                      {selectedWithdrawal.payment_method.phone_number && (
                        <span className="text-muted-foreground ml-2">
                          ({selectedWithdrawal.payment_method.phone_number})
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Approval Section */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold">Approve Withdrawal</h4>
                  
                  {/* M-Pesa Option */}
                  {isMpesaPayment && (
                    <Button
                      onClick={handleSendViaMpesa}
                      disabled={isProcessing}
                      className="w-full"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send via M-Pesa
                        </>
                      )}
                    </Button>
                  )}

                  {/* Manual Payment Option */}
                  <div className="space-y-2">
                    <Label htmlFor="payment-ref">
                      {isMpesaPayment ? 'Or mark as manually paid:' : 'Payment Reference'}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="payment-ref"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Enter payment reference (Bank Ref, Check #, etc.)"
                        className="flex-1"
                      />
                      <Button
                        onClick={handleMarkAsManuallyPaid}
                        disabled={isProcessing || !paymentReference}
                        variant="outline"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Banknote className="h-4 w-4 mr-2" />
                            Mark Paid
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Rejection Section */}
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-semibold text-destructive">Reject Withdrawal</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="rejection">Rejection Reason</Label>
                    <Textarea
                      id="rejection"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Enter reason for rejection..."
                      rows={2}
                    />
                  </div>

                  {/* Skip to next option - only for Chama */}
                  {selectedWithdrawal.chama_id && (
                    <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                      <Checkbox
                        id="skip-to-next"
                        checked={skipToNext}
                        onCheckedChange={(checked) => setSkipToNext(checked as boolean)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor="skip-to-next"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          Swap positions & pay next eligible member
                        </label>
                        <p className="text-xs text-muted-foreground">
                          The rejected member will be moved down and the next eligible member will receive payout
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isProcessing || !rejectionReason}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        {skipToNext && selectedWithdrawal.chama_id ? 'Reject & Skip to Next' : 'Reject'}
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-4">
                <WithdrawalMemberAnalytics
                  analytics={memberAnalytics}
                  nextEligible={nextEligible}
                  isLoading={isLoadingAnalytics}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
