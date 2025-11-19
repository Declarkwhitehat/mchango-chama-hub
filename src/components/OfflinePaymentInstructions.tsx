import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface OfflinePaymentInstructionsProps {
  memberCode: string;
  groupType: "chama" | "savings";
  groupName: string;
}

export const OfflinePaymentInstructions = ({ 
  memberCode, 
  groupType,
  groupName 
}: OfflinePaymentInstructionsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(memberCode);
      setCopied(true);
      toast.success("Member ID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          Offline Payment Instructions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Member ID Display */}
        <div className="p-4 rounded-lg bg-accent/50 border border-border">
          <p className="text-sm text-muted-foreground mb-2">Your Member ID</p>
          <div className="flex items-center gap-2">
            <code className="text-2xl font-bold text-primary tracking-wider">
              {memberCode}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="ml-auto"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Use this ID as the Account Number when making payments
          </p>
        </div>

        {/* Payment Instructions */}
        <div className="space-y-3">
          <p className="font-medium">To make an offline payment via M-Pesa:</p>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>Go to M-Pesa on your phone</li>
            <li>Select <strong>"Lipa na M-Pesa"</strong></li>
            <li>Select <strong>"Buy Goods and Services"</strong></li>
            <li>
              Enter Till Number: <strong className="text-primary">000000</strong>
              <span className="text-xs text-muted-foreground ml-2">
                (Till number will be updated soon)
              </span>
            </li>
            <li>Enter the amount you want to pay</li>
            <li>
              When asked for <strong>Account Number</strong>, enter:{" "}
              <code className="bg-accent px-2 py-1 rounded text-primary font-bold">
                {memberCode}
              </code>
            </li>
            <li>Enter your M-Pesa PIN and confirm</li>
          </ol>
        </div>

        {/* Alert */}
        <Alert className="bg-primary/5 border-primary/20">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription>
            <strong>Your payment will be credited automatically</strong> within 1 minute of 
            confirmation. You'll receive an SMS notification once processed.
          </AlertDescription>
        </Alert>

        {/* Important Notes */}
        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-sm font-medium">Important Notes:</p>
          <ul className="text-xs text-muted-foreground space-y-1 pl-4">
            <li>• Always use your unique Member ID ({memberCode}) as the account number</li>
            <li>• Keep your M-Pesa receipt (e.g., QCH7... ) for your records</li>
            <li>• Payment will appear in your {groupType === "chama" ? "Chama" : "Savings Group"} dashboard immediately</li>
            <li>• For payment issues, contact support with your M-Pesa receipt number</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
