import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Receipt, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Debt {
  id: string;
  principal_debt: number;
  penalty_debt: number;
  principal_remaining: number;
  penalty_remaining: number;
  status: string;
  cycle: { cycle_number: number };
}

interface AmountToPayCardProps {
  memberId: string;
  contributionAmount: number;
  missedCycles: number;
  currentCycleDue: boolean;
}

export function AmountToPayCard({ memberId, contributionAmount, missedCycles, currentCycleDue }: AmountToPayCardProps) {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberId) return;
    fetchDebts();
  }, [memberId]);

  const fetchDebts = async () => {
    const { data } = await supabase
      .from('chama_member_debts')
      .select(`id, principal_debt, penalty_debt, principal_remaining, penalty_remaining, status, cycle:contribution_cycles!cycle_id(cycle_number)`)
      .eq('member_id', memberId)
      .in('status', ['outstanding', 'partial'])
      .order('created_at', { ascending: true });
    setDebts((data as any) || []);
    setLoading(false);
  };

  const totalPenalty = debts.reduce((s, d) => s + d.penalty_remaining, 0);
  const totalPrincipal = debts.reduce((s, d) => s + d.principal_remaining, 0);
  const currentCycleGross = currentCycleDue ? contributionAmount / (1 - 0.05) : 0;
  const currentCycleCommission = currentCycleGross * 0.05;
  const totalPayable = totalPenalty + totalPrincipal + (totalPrincipal > 0 ? totalPrincipal * 0.05 : 0) + currentCycleGross;
  const totalCommission = totalPenalty + (totalPrincipal * 0.05) + currentCycleCommission;

  if (!loading && debts.length === 0 && !currentCycleDue) {
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
    <Card className={debts.length > 0 ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="h-5 w-5" />
          Amount to Pay
          {debts.length > 0 && (
            <Badge variant="destructive" className="ml-auto text-xs">
              {debts.length} outstanding debt{debts.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Outstanding debts — FIFO order */}
        {debts.map(debt => {
          const cycleNum = (debt.cycle as any)?.cycle_number;
          const totalDebtRemaining = debt.principal_remaining + debt.penalty_remaining;
          const principalCommission = debt.principal_remaining * 0.05;
          return (
            <div key={debt.id} className="space-y-1 rounded-md border border-destructive/20 bg-background/60 p-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Cycle #{cycleNum} — Outstanding Debt
              </div>
              <div className="ml-6 space-y-0.5 text-sm">
                {debt.penalty_remaining > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>10% penalty (cleared first)</span>
                    <span>KES {debt.penalty_remaining.toFixed(2)}</span>
                  </div>
                )}
                {debt.principal_remaining > 0 && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Principal owed</span>
                      <span>KES {debt.principal_remaining.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-orange-600 dark:text-orange-400">
                      <span>5% commission on principal</span>
                      <span>+ KES {principalCommission.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Current cycle */}
        {currentCycleDue && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-primary" />
              Current Cycle (On-time, after debts cleared)
            </div>
            <div className="ml-6 space-y-0.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Base contribution</span>
                <span>KES {contributionAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-orange-600 dark:text-orange-400">
                <span>Commission (5%)</span>
                <span>+ KES {currentCycleCommission.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Summary */}
        <div className="space-y-1 text-sm">
          {totalPenalty > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Penalties (cleared first)</span>
              <span>KES {totalPenalty.toFixed(2)}</span>
            </div>
          )}
          {totalPrincipal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Past principal + 5% commission</span>
              <span>KES {(totalPrincipal + totalPrincipal * 0.05).toFixed(2)}</span>
            </div>
          )}
          {currentCycleDue && (
            <div className="flex justify-between text-muted-foreground">
              <span>Current cycle + 5% commission</span>
              <span>KES {currentCycleGross.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
            <span>Total Payable</span>
            <span className="text-primary">KES {totalPayable.toFixed(2)}</span>
          </div>
        </div>

        {debts.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
            <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Payments clear debts in order: penalty first, then principal (net goes to the member you owed). Then current cycle.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
