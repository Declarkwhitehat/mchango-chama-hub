import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Wallet } from "lucide-react";
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
  // If chama is already active, don't show this component
  if (chamaStatus === 'active') {
    return null;
  }

  // Member hasn't been approved yet
  if (!memberStatus || memberStatus.approval_status !== 'approved') {
    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle>Awaiting Approval</AlertTitle>
        <AlertDescription>
          Your join request is pending manager approval. Once approved, you'll need to make your first payment to secure your position.
        </AlertDescription>
      </Alert>
    );
  }

  // Member is approved but hasn't paid
  if (!memberStatus.first_payment_completed) {
    return (
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg">First Payment Required</CardTitle>
          </div>
          <CardDescription>
            Pay your first contribution to secure your position
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Amount Required</p>
              <p className="text-2xl font-bold">KES {contributionAmount.toLocaleString()}</p>
            </div>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              <AlertCircle className="h-3 w-3 mr-1" />
              Not Paid
            </Badge>
          </div>
          
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 text-amber-900">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              <strong>Members who don't pay before the chama starts will be automatically removed.</strong>
              {' '}Pay now to secure your position. Your member number will be assigned based on payment order - 
              pay early to get a lower number and earlier payout!
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Member has paid - show their secured position
  return (
    <Card className="border-green-500/50 bg-green-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-lg">Position Secured!</CardTitle>
        </div>
        <CardDescription>
          Your first payment has been received
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Your Position</p>
            <p className="text-2xl font-bold text-green-600">#{memberStatus.order_index || '?'}</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Member Code</p>
            <p className="text-lg font-mono font-semibold">{memberStatus.member_code || 'Pending'}</p>
          </div>
        </div>
        
        {memberStatus.first_payment_at && (
          <p className="text-xs text-muted-foreground mt-3">
            Paid on {new Date(memberStatus.first_payment_at).toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        )}
        
        <Alert className="mt-4 bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            You're all set! Wait for the manager to start the chama. You will receive an SMS notification when it begins.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
