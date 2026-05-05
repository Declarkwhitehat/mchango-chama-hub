import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { CHAMA_DEFAULT_COMMISSION_RATE } from "@/utils/commissionCalculator";

interface WalletEntry {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
  applied_at: string | null;
}

interface OverpaymentWalletProps {
  chamaId: string;
  memberId: string;
  contributionAmount?: number;
}

export function OverpaymentWallet({ chamaId, memberId, contributionAmount }: OverpaymentWalletProps) {
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWallet();
  }, [chamaId, memberId]);

  const loadWallet = async () => {
    try {
      const { data, error } = await supabase
        .from('chama_overpayment_wallet')
        .select('id, amount, status, description, created_at, applied_at')
        .eq('chama_id', chamaId)
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error loading wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  const pendingEntries = entries.filter(e => e.status === 'pending');
  const appliedEntries = entries.filter(e => e.status === 'applied');
  const totalPending = pendingEntries.reduce((sum, e) => sum + e.amount, 0);

  if (loading || entries.length === 0) return null;

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-600" />
            Overpayment Wallet
          </span>
          {totalPending > 0 && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              KES {totalPending.toLocaleString()} available
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {totalPending > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              This is your <strong>net</strong> credit — commission was already deducted when the overpayment was received. It will be applied automatically to your next cycle. The remaining amount you still pay will be charged the standard commission like any normal contribution.
            </p>
            {contributionAmount && contributionAmount > 0 && (
              <div className="rounded-md bg-blue-100/60 dark:bg-blue-900/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                <div className="flex justify-between">
                  <span>Next cycle contribution (gross)</span>
                  <span className="font-semibold">KES {contributionAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Covered from wallet (net credit)</span>
                  <span className="font-semibold">- KES {Math.min(totalPending, contributionAmount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-blue-300/50 dark:border-blue-700/50 mt-1 pt-1">
                  <span>You still pay (commission applies)</span>
                  <span className="font-bold">
                    KES {Math.max(0, contributionAmount - totalPending).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {pendingEntries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between text-sm bg-blue-100/50 dark:bg-blue-900/30 rounded px-3 py-2">
            <span className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-blue-700 dark:text-blue-300">Pending</span>
            </span>
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              KES {entry.amount.toLocaleString()}
            </span>
          </div>
        ))}

        {appliedEntries.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Applied</p>
            {appliedEntries.slice(0, 3).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-xs text-muted-foreground rounded px-3 py-1.5">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Auto-applied
                  {entry.applied_at && (
                    <span>• {new Date(entry.applied_at).toLocaleDateString()}</span>
                  )}
                </span>
                <span className="font-medium">KES {entry.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
