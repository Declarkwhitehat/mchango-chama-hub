import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Smartphone, Building2 } from "lucide-react";
import { toast } from "sonner";

interface MchangoOfflinePaymentProps {
  groupCode: string;
  campaignTitle: string;
}

export const MchangoOfflinePayment = ({ groupCode, campaignTitle }: MchangoOfflinePaymentProps) => {
  const tillNumber = "5680227"; // Default till number - can be made configurable
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  return (
    <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Pay Offline via M-Pesa</CardTitle>
        </div>
        <CardDescription>
          No internet? Use M-Pesa to donate directly
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Campaign Code Display */}
        <div className="bg-background rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Campaign Code</p>
              <p className="text-3xl font-bold font-mono text-primary">{groupCode}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(groupCode, "Campaign code")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Payment Steps */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">How to Pay:</h4>
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">1</Badge>
              <span>Go to M-Pesa menu → <strong>Lipa na M-Pesa</strong></span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">2</Badge>
              <span>Select <strong>Buy Goods and Services</strong></span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">3</Badge>
              <div className="flex items-center gap-2">
                <span>Enter Till Number:</span>
                <code className="bg-muted px-2 py-0.5 rounded font-mono font-bold">{tillNumber}</code>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0"
                  onClick={() => copyToClipboard(tillNumber, "Till number")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">4</Badge>
              <span>Enter the amount you wish to donate</span>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">5</Badge>
              <div>
                <span>When prompted for <strong>Account Number</strong>, enter:</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-primary/10 text-primary px-3 py-1 rounded font-mono font-bold text-lg">{groupCode}</code>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(groupCode, "Campaign code")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <Badge variant="outline" className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">6</Badge>
              <span>Enter your M-Pesa PIN and confirm</span>
            </li>
          </ol>
        </div>

        {/* Info Note */}
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Building2 className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Your donation will be automatically credited to <strong>"{campaignTitle}"</strong> once payment is confirmed. 
              You'll receive an SMS confirmation.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
