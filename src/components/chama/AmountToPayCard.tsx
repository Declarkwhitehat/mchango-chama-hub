import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Receipt, Clock, CheckCircle2 } from "lucide-react";
import { 
  CHAMA_DEFAULT_COMMISSION_RATE, 
  CHAMA_LATE_COMMISSION_RATE,
  calculateAmountToPay 
} from "@/utils/commissionCalculator";

interface AmountToPayCardProps {
  contributionAmount: number;
  missedCycles: number;
  currentCycleDue: boolean;
}

export function AmountToPayCard({ 
  contributionAmount, 
  missedCycles, 
  currentCycleDue 
}: AmountToPayCardProps) {
  const calc = calculateAmountToPay(contributionAmount, missedCycles, currentCycleDue);
  const totalCyclesDue = calc.onTimeCycles + calc.lateCycles;

  if (totalCyclesDue === 0) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <p className="font-semibold text-green-600">All cycles paid — nothing due!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={missedCycles > 0 ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="h-5 w-5" />
          Amount to Pay
          {missedCycles > 0 && (
            <Badge variant="destructive" className="ml-auto text-xs">
              {missedCycles} missed cycle{missedCycles !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current cycle */}
        {calc.onTimeCycles > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-primary" />
              Current Cycle (On-time)
            </div>
            <div className="ml-6 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base contribution</span>
                <span>KES {contributionAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                <span>Commission ({(CHAMA_DEFAULT_COMMISSION_RATE * 100)}%)</span>
                <span>+ KES {calc.onTimeCommission.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Missed cycles */}
        {calc.lateCycles > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {calc.lateCycles} Missed Cycle{calc.lateCycles !== 1 ? 's' : ''} (Late)
            </div>
            <div className="ml-6 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {calc.lateCycles} × KES {contributionAmount.toLocaleString()}
                </span>
                <span>KES {(calc.lateCycles * contributionAmount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-destructive">
                <span>Late commission ({(CHAMA_LATE_COMMISSION_RATE * 100)}%)</span>
                <span>+ KES {calc.lateCommission.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Summary */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Base total ({totalCyclesDue} cycle{totalCyclesDue !== 1 ? 's' : ''})</span>
            <span>KES {calc.baseTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
            <span>Total commission</span>
            <span>+ KES {calc.totalCommission.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
            <span>Total Payable</span>
            <span className="text-primary">KES {calc.totalPayable.toLocaleString()}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          Commission is deducted immediately at payment. Only net funds go to the chama pool.
        </p>
      </CardContent>
    </Card>
  );
}
