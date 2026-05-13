import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Receipt, Building, Wallet } from "lucide-react";

type Source = "all" | "chama" | "organization" | "mchango" | "welfare";

interface Row {
  transaction_fee: number | null;
  safaricom_cost: number | null;
  company_revenue: number | null;
  chama_id: string | null;
  organization_id: string | null;
  mchango_id: string | null;
  welfare_id: string | null;
}

const fmt = (n: number) =>
  `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

export const MpesaFeeSummary = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>("all");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("withdrawals")
        .select(
          "transaction_fee, safaricom_cost, company_revenue, chama_id, organization_id, mchango_id, welfare_id"
        )
        .eq("status", "completed")
        .gt("transaction_fee", 0)
        .limit(5000);
      if (!cancel) {
        setRows((data as Row[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const filtered = useMemo(() => {
    if (source === "all") return rows;
    return rows.filter((r) =>
      source === "chama" ? r.chama_id :
      source === "organization" ? r.organization_id :
      source === "mchango" ? r.mchango_id :
      r.welfare_id
    );
  }, [rows, source]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        fees: acc.fees + Number(r.transaction_fee || 0),
        cost: acc.cost + Number(r.safaricom_cost || 0),
        revenue: acc.revenue + Number(r.company_revenue || 0),
      }),
      { fees: 0, cost: 0, revenue: 0 }
    );
  }, [filtered]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">M-PESA B2C Transaction Fees</CardTitle>
          <CardDescription>Recipient-paid fees on completed payouts. Company Revenue is included in Total Revenue above.</CardDescription>
        </div>
        <Select value={source} onValueChange={(v) => setSource(v as Source)}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment types</SelectItem>
            <SelectItem value="chama">Chama Payouts</SelectItem>
            <SelectItem value="organization">Organization Withdrawals</SelectItem>
            <SelectItem value="mchango">Campaign Withdrawals</SelectItem>
            <SelectItem value="welfare">Welfare Disbursements</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-20 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Fees Collected</span>
                <Receipt className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold">{fmt(totals.fees)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Safaricom Cost</span>
                <Building className="h-4 w-4 text-rose-600" />
              </div>
              <div className="text-2xl font-bold">{fmt(totals.cost)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Company Revenue</span>
                <Wallet className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold">{fmt(totals.revenue)}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
