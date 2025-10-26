import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Wallet, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

export const WithdrawalsManagement = () => {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

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
        headers: { Authorization: `Bearer ${session.access_token}` }
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

  const handleApprove = async () => {
    if (!paymentReference) {
      toast({
        title: "Error",
        description: "Please enter payment reference",
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

      const { error } = await supabase.functions.invoke(
        `withdrawals-crud/${selectedWithdrawal.id}`,
        {
          body: {
            status: 'completed',
            payment_reference: paymentReference,
          },
          method: 'PATCH',
          headers: { Authorization: `Bearer ${session.access_token}` }
        }
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: "Withdrawal approved and completed",
      });

      setSelectedWithdrawal(null);
      setPaymentReference("");
    } catch (error: any) {
      console.error("Error approving withdrawal:", error);
      toast({
        title: "Error",
        description: "Failed to approve withdrawal",
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

      const { error } = await supabase.functions.invoke(
        `withdrawals-crud/${selectedWithdrawal.id}`,
        {
          body: {
            status: 'rejected',
            rejection_reason: rejectionReason,
          },
          method: 'PATCH',
          headers: { Authorization: `Bearer ${session.access_token}` }
        }
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: "Withdrawal rejected",
      });

      setSelectedWithdrawal(null);
      setRejectionReason("");
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
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
                    <TableCell className="font-semibold text-green-600">
                      KES {Number(withdrawal.net_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                    <TableCell>
                      {withdrawal.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedWithdrawal(withdrawal)}
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

      <Dialog open={!!selectedWithdrawal} onOpenChange={() => setSelectedWithdrawal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Withdrawal Request</DialogTitle>
            <DialogDescription>
              Approve or reject this withdrawal request
            </DialogDescription>
          </DialogHeader>

          {selectedWithdrawal && (
            <div className="space-y-4">
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
                  <p className="text-xl font-bold text-green-600">
                    KES {Number(selectedWithdrawal.net_amount).toLocaleString()}
                  </p>
                </div>
              </div>

              {selectedWithdrawal.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{selectedWithdrawal.notes}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="payment-ref">Payment Reference</Label>
                <Input
                  id="payment-ref"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Enter payment reference (M-PESA, Bank Ref, etc.)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection">Rejection Reason (if rejecting)</Label>
                <Textarea
                  id="rejection"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing || !paymentReference}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve & Complete
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessing || !rejectionReason}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};