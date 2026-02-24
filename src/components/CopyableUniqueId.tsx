import { Copy, Check, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

interface CopyableUniqueIdProps {
  uniqueId: string;
  label?: string;
  className?: string;
}

const PAYBILL_NUMBER = "4015351";

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md hover:bg-accent transition-colors"
      aria-label={`Copy ${label}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
};

export const CopyableUniqueId = ({ uniqueId, label = "Account Number", className = "" }: CopyableUniqueIdProps) => {
  return (
    <Card className={`border-primary/20 bg-gradient-to-br from-primary/5 to-background ${className}`}>
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h4 className="font-semibold text-foreground">M-Pesa Paybill Payment</h4>
        </div>

        {/* Paybill & Account Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Paybill Number */}
          <div className="p-3 rounded-lg bg-background border border-border">
            <p className="text-xs text-muted-foreground mb-1">Business Number (Paybill)</p>
            <div className="flex items-center justify-between">
              <span className="text-xl font-mono font-bold text-foreground tracking-wider">
                {PAYBILL_NUMBER}
              </span>
              <CopyButton value={PAYBILL_NUMBER} label="Paybill number" />
            </div>
          </div>

          {/* Account Number */}
          <div className="p-3 rounded-lg bg-background border-2 border-primary/30">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <div className="flex items-center justify-between">
              <span className="text-xl font-mono font-bold text-primary tracking-wider">
                {uniqueId}
              </span>
              <CopyButton value={uniqueId} label={label} />
            </div>
          </div>
        </div>

        {/* Payment Steps */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How to pay</p>
          <ol className="grid grid-cols-1 gap-1 text-sm text-foreground">
            {[
              "Go to M-Pesa → Lipa na M-Pesa → Paybill",
              `Business No: ${PAYBILL_NUMBER}`,
              `Account No: ${uniqueId}`,
              "Enter amount → M-Pesa PIN → Confirm",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Auto-credit note */}
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          ✅ Payment reflects automatically within 1 minute
        </p>
      </CardContent>
    </Card>
  );
};
