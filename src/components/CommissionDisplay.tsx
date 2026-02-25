import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, Wallet, DollarSign } from "lucide-react";

interface CommissionDisplayProps {
  totalCollected: number;
  commissionRate: number;
  type: 'mchango' | 'chama' | 'organization';
  showBreakdown?: boolean;
  availableBalance?: number;
  totalWithdrawn?: number;
  actualCommission?: number;
}

export const CommissionDisplay = ({ 
  totalCollected, 
  commissionRate, 
  type,
  showBreakdown = true,
  availableBalance,
  totalWithdrawn,
  actualCommission,
}: CommissionDisplayProps) => {
  // Use actual DB commission if provided, otherwise calculate
  const commissionAmount = actualCommission ?? (totalCollected * commissionRate);
  const netAfterCommission = totalCollected - commissionAmount;
  
  // Use actual available_balance from DB if provided, otherwise fall back to calculated
  const isCreatorView = availableBalance !== undefined;
  const netBalance = isCreatorView ? availableBalance : netAfterCommission;
  
  // Auto-derive totalWithdrawn so breakdown always sums: Total - Commission - Withdrawn = Available
  const derivedWithdrawn = isCreatorView
    ? (totalWithdrawn ?? Math.max(0, totalCollected - commissionAmount - availableBalance))
    : 0;
  
  const commissionPercentage = (commissionRate * 100).toFixed(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Balance & Commission
        </CardTitle>
        <CardDescription>
          {type === 'mchango' ? '7%' : '5%'} commission deducted at payment
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Collected */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Collected</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              KES {totalCollected.toLocaleString()}
            </p>
          </div>

          {/* Commission */}
          <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-orange-600" />
              <p className="text-sm text-orange-900 dark:text-orange-400">
                Commission ({commissionPercentage}%)
              </p>
            </div>
            <p className="text-2xl font-bold text-orange-600">
              KES {commissionAmount.toLocaleString()}
            </p>
          </div>

          {/* Net Balance */}
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">
                {isCreatorView ? 'Available Balance' : 'Net After Commission'}
              </p>
            </div>
            <p className="text-2xl font-bold text-primary">
              KES {netBalance.toLocaleString()}
            </p>
            {isCreatorView && (
              <p className="text-xs text-muted-foreground mt-1">
                Available for payout
                {derivedWithdrawn > 0 && (
                  <span className="block">
                    (KES {derivedWithdrawn.toLocaleString()} withdrawn)
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {showBreakdown && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
            <p className="text-sm font-medium mb-2">Commission Breakdown:</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Total Collected:</span>
                <span className="font-medium text-foreground">
                  KES {totalCollected.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Commission ({commissionPercentage}%):</span>
                <span className="font-medium text-orange-600">
                  - KES {commissionAmount.toLocaleString()}
                </span>
              </div>
              {derivedWithdrawn > 0 && (
                <div className="flex justify-between">
                  <span>Withdrawn:</span>
                  <span className="font-medium text-orange-600">
                    - KES {derivedWithdrawn.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-medium">
                  {isCreatorView ? 'Available Balance:' : 'Net After Commission:'}
                </span>
                <span className="font-bold text-primary">
                  KES {netBalance.toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 italic">
              * Commission is deducted at the time of payout/withdrawal
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
