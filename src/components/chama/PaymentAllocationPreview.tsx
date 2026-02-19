import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  AlertTriangle, Building2, Coins, ArrowRight, 
  PiggyBank, Receipt, CheckCircle2
} from "lucide-react";

interface AllocationLine {
  type: string;
  debt_id?: string;
  cycle_number?: number;
  amount: number;
  destination: string;
  description: string;
}

interface PreviewData {
  allocations: AllocationLine[];
  total_gross: number;
  total_to_company: number;
  total_to_recipients: number;
  total_to_cycle_pot: number;
  carry_forward: number;
  periods_cleared: number;
}

interface PaymentAllocationPreviewProps {
  memberId: string;
  chamaId: string;
  grossAmount: number;
}

const typeConfig: Record<string, { icon: any; color: string; label: string }> = {
  penalty_clearance:       { icon: AlertTriangle, color: 'text-destructive', label: 'Penalty Cleared' },
  principal_commission:    { icon: Building2,     color: 'text-orange-500',  label: 'Commission (5%)' },
  principal_clearance:     { icon: ArrowRight,    color: 'text-primary',     label: 'Debt Principal' },
  current_cycle_commission:{ icon: Building2,     color: 'text-orange-500',  label: 'Commission' },
  current_cycle:           { icon: Coins,         color: 'text-green-600',   label: 'Current Cycle' },
  carry_forward_commission:{ icon: Building2,     color: 'text-orange-500',  label: 'Commission' },
  carry_forward:           { icon: PiggyBank,     color: 'text-blue-500',    label: 'Carry-forward' },
  pending_cycle:           { icon: Coins,         color: 'text-green-600',   label: 'Pending Cycle' },
};

export function PaymentAllocationPreview({ memberId, chamaId, grossAmount }: PaymentAllocationPreviewProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId || !chamaId || !grossAmount || grossAmount <= 0) return;
    const timer = setTimeout(fetchPreview, 400); // debounce
    return () => clearTimeout(timer);
  }, [memberId, chamaId, grossAmount]);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('contributions-crud', {
        body: {
          action: 'preview-allocation',
          member_id: memberId,
          chama_id: chamaId,
          gross_amount: grossAmount
        }
      });

      if (fnError) throw fnError;
      setPreview(data?.preview || null);
    } catch (err: any) {
      setError('Could not load allocation preview');
      console.error('Preview error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!grossAmount || grossAmount <= 0) return null;

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            How Your Payment Will Be Used
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error || !preview) return null;

  const penaltyLines = preview.allocations.filter(a => a.type === 'penalty_clearance');
  const principalLines = preview.allocations.filter(a => a.type === 'principal_clearance');
  const commissionLines = preview.allocations.filter(a => 
    a.type === 'principal_commission' || a.type === 'current_cycle_commission' || a.type === 'carry_forward_commission'
  );
  const currentCycleLines = preview.allocations.filter(a => a.type === 'current_cycle');
  const carryForwardLines = preview.allocations.filter(a => a.type === 'carry_forward');

  const hasDebotsToSettle = penaltyLines.length > 0 || principalLines.length > 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          How Your KES {grossAmount.toLocaleString()} Will Be Used
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Debt settlement lines */}
        {hasDebotsToSettle && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clearing Outstanding Debts</p>
            {penaltyLines.map((line, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-destructive/10 rounded px-2 py-1">
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {line.description}
                </span>
                <span className="font-semibold text-destructive">KES {line.amount.toFixed(2)}</span>
              </div>
            ))}
            {principalLines.map((line, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-primary/10 rounded px-2 py-1">
                <span className="flex items-center gap-1.5 text-primary">
                  <ArrowRight className="h-3 w-3" />
                  {line.description}
                </span>
                <span className="font-semibold text-primary">KES {line.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current cycle */}
        {currentCycleLines.length > 0 && (
          <div className="space-y-1">
            {hasDebotsToSettle && <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Cycle</p>}
            {currentCycleLines.map((line, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-green-500/10 rounded px-2 py-1">
                <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                  <Coins className="h-3 w-3" />
                  {line.description}
                </span>
                <span className="font-semibold text-green-700 dark:text-green-400">KES {line.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Carry-forward */}
        {carryForwardLines.length > 0 && (
          <div className="space-y-1">
            {carryForwardLines.map((line, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-blue-500/10 rounded px-2 py-1">
                <span className="flex items-center gap-1.5 text-blue-600">
                  <PiggyBank className="h-3 w-3" />
                  {line.description}
                </span>
                <span className="font-semibold text-blue-600">KES {line.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <Separator className="my-1" />

        {/* Summary totals */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Total commissions to platform</span>
            <span className="font-medium text-orange-600">KES {preview.total_to_company.toFixed(2)}</span>
          </div>
          {preview.total_to_recipients > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Net to deficit recipients</span>
              <span className="font-medium text-primary">KES {preview.total_to_recipients.toFixed(2)}</span>
            </div>
          )}
          {preview.total_to_cycle_pot > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Net to cycle collection pot</span>
              <span className="font-medium text-green-600">KES {preview.total_to_cycle_pot.toFixed(2)}</span>
            </div>
          )}
          {preview.carry_forward > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Carry-forward credit</span>
              <span className="font-medium text-blue-600">KES {preview.carry_forward.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm border-t border-border pt-1">
            <span>Total</span>
            <span>KES {preview.total_gross.toFixed(2)}</span>
          </div>
        </div>

        {preview.periods_cleared > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            This payment will clear {preview.periods_cleared} period{preview.periods_cleared !== 1 ? 's' : ''}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
