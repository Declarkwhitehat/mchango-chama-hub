import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, History, CheckCircle2, AlertCircle, DollarSign, Calendar } from "lucide-react";

const repaymentSchema = z.object({
  amount: z.string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Must be a valid positive number"),
  phone: z.string()
    .min(10, "Phone number is required")
    .regex(/^254\d{9}$/, "Must be in format 254XXXXXXXXX"),
});

type RepaymentFormData = z.infer<typeof repaymentSchema>;

interface LoanRepaymentFormProps {
  loan: any;
  onSuccess?: () => void;
}

export default function LoanRepaymentForm({ loan, onSuccess }: LoanRepaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const { toast } = useToast();

  const form = useForm<RepaymentFormData>({
    resolver: zodResolver(repaymentSchema),
    defaultValues: {
      amount: "",
      phone: "",
    },
  });

  useEffect(() => {
    fetchRepaymentHistory();
  }, [loan.id]);

  const fetchRepaymentHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("saving_group_loan_repayments")
        .select("*")
        .eq("loan_id", loan.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRepayments(data || []);
    } catch (error: any) {
      console.error("Error fetching repayment history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const onSubmit = async (values: RepaymentFormData) => {
    const amount = Number(values.amount);

    if (amount > loan.balance_remaining) {
      toast({
        title: "Amount Exceeds Balance",
        description: `Maximum repayment amount is KES ${loan.balance_remaining.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Step 1: Initiate M-Pesa STK Push
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const stkResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mpesa-stk-push`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: values.phone,
            amount: amount,
            account_reference: `LOAN-${loan.id.substring(0, 8)}`,
            transaction_desc: `Loan Repayment - ${loan.saving_group_id}`,
          }),
        }
      );

      const stkResult = await stkResponse.json();

      if (!stkResponse.ok) {
        throw new Error(stkResult.error || "Failed to initiate payment");
      }

      toast({
        title: "Payment Request Sent",
        description: "Please check your phone and enter your M-Pesa PIN to complete the payment.",
      });

      // Step 2: Poll for payment confirmation (simulate callback)
      // In production, this would be handled by the M-Pesa callback
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Step 3: Record the repayment
      const repaymentResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-loans/loans/${loan.id}/repay`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amount,
            payment_reference: stkResult.CheckoutRequestID || `MPESA-${Date.now()}`,
          }),
        }
      );

      const repaymentResult = await repaymentResponse.json();

      if (!repaymentResponse.ok) {
        throw new Error(repaymentResult.error || "Failed to record repayment");
      }

      toast({
        title: "Repayment Successful",
        description: `KES ${amount.toFixed(2)} has been applied to your loan. Remaining balance: KES ${repaymentResult.loan.balance_remaining.toFixed(2)}`,
      });

      form.reset();
      fetchRepaymentHistory();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Payment Failed",
        description: error.message || "Failed to process repayment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalRepaid = loan.requested_amount - loan.balance_remaining;
  const repaymentProgress = (totalRepaid / loan.requested_amount) * 100;

  return (
    <div className="space-y-6">
      {/* Loan Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Loan Summary
          </CardTitle>
          <CardDescription>Outstanding balance and repayment details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Original Amount</p>
              <p className="text-2xl font-bold">KES {loan.requested_amount.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Total Repaid</p>
              <p className="text-2xl font-bold text-primary">KES {totalRepaid.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary">
              <p className="text-sm text-muted-foreground mb-1">Outstanding Balance</p>
              <p className="text-2xl font-bold text-primary">KES {loan.balance_remaining.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Repayment Progress</span>
              <span className="font-medium">{repaymentProgress.toFixed(1)}%</span>
            </div>
            <Progress value={repaymentProgress} className="h-3" />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Interest Rate</p>
              <p className="font-semibold">{loan.interest_rate}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Due Date</p>
              <p className="font-semibold flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(loan.due_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Disbursed Amount</p>
              <p className="font-semibold">KES {loan.disbursed_amount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <Badge variant={loan.status === 'DISBURSED' ? 'default' : 'secondary'}>
                {loan.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Repayment Form */}
      {loan.balance_remaining > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Make Repayment</CardTitle>
            <CardDescription>Pay via M-Pesa STK Push</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repayment Amount (KES)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Enter amount"
                          {...field}
                          disabled={loading}
                        />
                      </FormControl>
                      <FormDescription>
                        Outstanding balance: KES {loan.balance_remaining.toLocaleString()}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>M-Pesa Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="254XXXXXXXXX"
                          {...field}
                          disabled={loading}
                        />
                      </FormControl>
                      <FormDescription>
                        Enter phone number in format 254XXXXXXXXX
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Alert>
                  <DollarSign className="h-4 w-4" />
                  <AlertTitle>Payment Process</AlertTitle>
                  <AlertDescription>
                    You'll receive an M-Pesa prompt on your phone. Enter your PIN to complete the repayment. 
                    The payment will be automatically applied to your loan balance.
                  </AlertDescription>
                </Alert>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Pay with M-Pesa
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {loan.balance_remaining === 0 && (
        <Alert className="border-primary">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle>Loan Fully Repaid</AlertTitle>
          <AlertDescription>
            Congratulations! You have successfully repaid this loan in full.
          </AlertDescription>
        </Alert>
      )}

      {/* Repayment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Repayment History
          </CardTitle>
          <CardDescription>All payments made towards this loan</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : repayments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No repayments made yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repayments.map((repayment) => (
                  <TableRow key={repayment.id}>
                    <TableCell>
                      {new Date(repayment.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold text-primary">
                      KES {repayment.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Completed
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
