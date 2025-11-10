import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calculator, AlertCircle, CheckCircle2 } from "lucide-react";

const PROFIT_FEE_RATE = 0.05; // 5%
const COMMISSION_RATE = 0.015; // 1.5%

const loanRequestSchema = z.object({
  amount: z.string()
    .min(1, "Loan amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Must be a valid positive number"),
  purpose: z.string()
    .min(10, "Purpose must be at least 10 characters")
    .max(500, "Purpose must be less than 500 characters"),
});

type LoanRequestFormData = z.infer<typeof loanRequestSchema>;

interface LoanRequestFormProps {
  groupId: string;
  memberId: string;
  onSuccess?: () => void;
}

export default function LoanRequestForm({ groupId, memberId, onSuccess }: LoanRequestFormProps) {
  const [loading, setLoading] = useState(false);
  const [memberData, setMemberData] = useState<any>(null);
  const [calculatedValues, setCalculatedValues] = useState({
    requestedAmount: 0,
    profitFee: 0,
    commission: 0,
    totalDeductions: 0,
    netAmount: 0,
  });
  const { toast } = useToast();

  const form = useForm<LoanRequestFormData>({
    resolver: zodResolver(loanRequestSchema),
    defaultValues: {
      amount: "",
      purpose: "",
    },
  });

  const watchAmount = form.watch("amount");

  // Fetch member data
  useEffect(() => {
    const fetchMemberData = async () => {
      try {
        const { data, error } = await supabase
          .from("saving_group_members")
          .select("current_savings, is_loan_eligible")
          .eq("id", memberId)
          .single();

        if (error) throw error;
        setMemberData(data);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    };

    fetchMemberData();
  }, [memberId, toast]);

  // Calculate deductions in real-time
  useEffect(() => {
    const amount = Number(watchAmount) || 0;
    const profitFee = amount * PROFIT_FEE_RATE;
    const commission = amount * COMMISSION_RATE;
    const totalDeductions = profitFee + commission;
    const netAmount = amount - totalDeductions;

    setCalculatedValues({
      requestedAmount: amount,
      profitFee,
      commission,
      totalDeductions,
      netAmount,
    });
  }, [watchAmount]);

  const maxEligibleAmount = memberData ? memberData.current_savings * 1.5 : 0;

  const onSubmit = async (values: LoanRequestFormData) => {
    if (!memberData?.is_loan_eligible) {
      toast({
        title: "Not Eligible",
        description: "You are not eligible for a loan at this time.",
        variant: "destructive",
      });
      return;
    }

    const amount = Number(values.amount);
    if (amount > maxEligibleAmount) {
      toast({
        title: "Amount Exceeds Limit",
        description: `Maximum eligible amount is KES ${maxEligibleAmount.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        `savings-group-loans/groups/${groupId}/members/${memberId}/loans`,
        {
          body: {
            requested_amount: amount,
            purpose: values.purpose,
          },
        }
      );

      if (error) throw error;

      toast({
        title: "Loan Request Submitted",
        description: data.status === "APPROVED" 
          ? `Your loan of KES ${amount.toFixed(2)} has been instantly approved!`
          : "Your loan request is pending manager approval.",
      });

      form.reset();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit loan request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!memberData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!memberData.is_loan_eligible) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You are not eligible for a loan at this time. Continue making deposits to become eligible.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Loan Eligibility
          </CardTitle>
          <CardDescription>Your maximum eligible loan amount</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Current Savings</p>
                <p className="text-2xl font-bold">KES {memberData.current_savings.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Max Eligible (150%)</p>
                <p className="text-2xl font-bold text-primary">KES {maxEligibleAmount.toFixed(2)}</p>
              </div>
            </div>
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                You can borrow up to 50% above your current savings balance.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request Loan</CardTitle>
          <CardDescription>Enter loan details and see the breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount (KES)</FormLabel>
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
                      Maximum: KES {maxEligibleAmount.toFixed(2)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {calculatedValues.requestedAmount > 0 && (
                <Card className="border-2 border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Deduction Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Requested Amount</span>
                      <span className="font-medium">KES {calculatedValues.requestedAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Profit Fee (5%)</span>
                      <span className="font-medium text-destructive">- KES {calculatedValues.profitFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Commission (1.5%)</span>
                      <span className="font-medium text-destructive">- KES {calculatedValues.commission.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold">
                      <span>You Will Receive</span>
                      <span className="text-primary text-lg">KES {calculatedValues.netAmount.toFixed(2)}</span>
                    </div>
                    <Alert>
                      <AlertDescription className="text-xs">
                        Total deductions: KES {calculatedValues.totalDeductions.toFixed(2)} ({((calculatedValues.totalDeductions / calculatedValues.requestedAmount) * 100).toFixed(1)}%)
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              )}

              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Purpose</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe why you need this loan..."
                        className="min-h-[100px]"
                        {...field}
                        disabled={loading}
                      />
                    </FormControl>
                    <FormDescription>
                      Minimum 10 characters, maximum 500 characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={loading || calculatedValues.requestedAmount > maxEligibleAmount}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Loan Request
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
