import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CreditCard, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PayBillAccountCardProps {
  paybillAccountId: string;
  paybillNumber?: string;
  entityName: string;
  entityType: "mchango" | "organization";
}

export const PayBillAccountCard = ({
  paybillAccountId,
  paybillNumber = "522522", // Default M-Pesa PayBill number - replace with actual
  entityName,
  entityType,
}: PayBillAccountCardProps) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const commissionRate = entityType === "mchango" ? "15%" : "5%";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            M-Pesa PayBill Payment
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {commissionRate} fee
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Donate to <span className="font-medium text-foreground">{entityName}</span> via M-Pesa PayBill using the details below:
        </p>

        <div className="space-y-3">
          {/* PayBill Number */}
          <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
            <div>
              <p className="text-xs text-muted-foreground">PayBill Number</p>
              <p className="text-lg font-bold font-mono">{paybillNumber}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(paybillNumber, "PayBill Number")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          {/* Account Number */}
          <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-primary/30">
            <div>
              <p className="text-xs text-muted-foreground">Account Number</p>
              <p className="text-lg font-bold font-mono text-primary">{paybillAccountId}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(paybillAccountId, "Account Number")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Instructions */}
        <div className="pt-2 border-t">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p><strong>How to pay:</strong></p>
              <ol className="list-decimal list-inside space-y-0.5 ml-2">
                <li>Go to M-Pesa → Lipa na M-Pesa → Pay Bill</li>
                <li>Enter Business No: <span className="font-mono font-medium">{paybillNumber}</span></li>
                <li>Enter Account No: <span className="font-mono font-medium text-primary">{paybillAccountId}</span></li>
                <li>Enter amount and your M-Pesa PIN</li>
              </ol>
              <p className="mt-2">Payment is credited automatically within seconds.</p>
            </div>
          </div>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-center text-muted-foreground cursor-help">
                A {commissionRate} platform fee is deducted from each donation
              </p>
            </TooltipTrigger>
            <TooltipContent>
              <p>This fee covers payment processing and platform maintenance</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};
