import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FirstPaymentStatusProps {
  memberStatus: {
    first_payment_completed: boolean;
    first_payment_at?: string;
    order_index?: number;
    member_code?: string;
    approval_status: string;
  } | null;
  contributionAmount: number;
  chamaName: string;
  chamaStatus: string;
}

export const FirstPaymentStatus = ({
  memberStatus,
  contributionAmount,
  chamaName,
  chamaStatus
}: FirstPaymentStatusProps) => {
  // Only show this component for pending chamas (waiting to start)
  if (chamaStatus !== 'pending') {
    return null;
  }

  // Member hasn't been approved yet
  if (!memberStatus || memberStatus.approval_status !== 'approved') {
    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle>Awaiting Approval</AlertTitle>
        <AlertDescription>
          Your join request is pending manager approval. Once approved, you'll be ready to participate when the manager starts the chama.
        </AlertDescription>
      </Alert>
    );
  }

  // Member is approved - waiting for manager to start
  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">You're Approved!</CardTitle>
        </div>
        <CardDescription>
          Waiting for the manager to start the chama
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Contribution Amount</p>
            <p className="text-2xl font-bold">KES {contributionAmount.toLocaleString()}</p>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        </div>
        
        <Alert className="bg-primary/5 border-primary/20">
          <Clock className="h-4 w-4 text-primary" />
          <AlertDescription className="text-foreground">
            Once the manager starts "{chamaName}", you'll receive an SMS with your member number and payout schedule. 
            Contributions will begin immediately after the chama starts.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
