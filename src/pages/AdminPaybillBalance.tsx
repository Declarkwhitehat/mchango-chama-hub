import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, AlertTriangle, Eye, EyeOff, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ADMIN_PRIVILEGE_CODE = "D3E9C0L1A3R9K";

interface Snapshot {
  id: string;
  shortcode: string;
  working_account: number | null;
  utility_account: number | null;
  charges_paid_account: number | null;
  merchant_account: number | null;
  organization_settlement_account: number | null;
  result_code: number | null;
  result_desc: string | null;
  queried_at: string;
  completed_at: string | null;
}

const formatKES = (v: number | null) =>
  v == null ? "—" : `KES ${Number(v).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminPaybillBalance = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showCode, setShowCode] = useState(false);

  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSnapshots = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("paybill_balance_snapshots")
      .select("*")
      .order("queried_at", { ascending: false })
      .limit(10);
    if (!error && data) {
      const completed = data.find((d: any) => d.completed_at) as Snapshot | undefined;
      setLatest(completed ?? (data[0] as Snapshot) ?? null);
      setHistory(data as Snapshot[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isUnlocked) fetchSnapshots();
  }, [isUnlocked]);

  const handleUnlock = () => {
    if (code === ADMIN_PRIVILEGE_CODE) {
      setIsUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setAttempts((p) => p + 1);
      setCode("");
    }
  };

  const queryBalance = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("paybill-balance-query", {
        body: { privilege_code: ADMIN_PRIVILEGE_CODE },
      });
      if (error) throw error;
      toast({
        title: "Balance request sent",
        description: data?.message ?? "Safaricom will return the balance shortly.",
      });
      // Poll a few times for the callback
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        await fetchSnapshots();
        const { data: s } = await supabase
          .from("paybill_balance_snapshots")
          .select("completed_at")
          .eq("conversation_id", data?.conversation_id ?? "")
          .maybeSingle();
        if (s?.completed_at) break;
      }
    } catch (e: any) {
      toast({
        title: "Failed to query balance",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (!isUnlocked) {
    return (
      <AdminLayout>
        <div className="container px-4 py-8 max-w-lg mx-auto">
          <Card className="border-2 border-destructive/30">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <Shield className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Paybill Balance</CardTitle>
              <CardDescription className="text-base">
                Sensitive M-Pesa float data. Enter the admin privilege code to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showCode ? "text" : "password"}
                  placeholder="Enter privilege code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  className={`pl-10 pr-10 ${error ? "border-destructive" : ""}`}
                  disabled={attempts >= 5}
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Invalid privilege code. {5 - attempts} attempts remaining.</span>
                </div>
              )}
              {attempts >= 5 && (
                <div className="text-destructive text-sm text-center font-medium">
                  Too many failed attempts. Please contact the system administrator.
                </div>
              )}
              <Button onClick={handleUnlock} className="w-full" disabled={!code || attempts >= 5}>
                <Shield className="h-4 w-4 mr-2" />
                Unlock Paybill Balance
              </Button>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Wallet className="h-7 w-7 text-primary" /> Paybill Balance
            </h1>
            <p className="text-muted-foreground mt-1">
              Live M-Pesa float for shortcode{" "}
              <span className="font-mono font-semibold">{latest?.shortcode ?? "—"}</span>
            </p>
          </div>
          <Button onClick={queryBalance} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Querying Safaricom…" : "Refresh Balance"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Working Account", value: latest?.working_account, hint: "Available for B2C payouts" },
            { label: "Utility Account", value: latest?.utility_account, hint: "M-Pesa collections (C2B)" },
            { label: "Charges Paid Account", value: latest?.charges_paid_account },
            { label: "Merchant Account", value: latest?.merchant_account },
            { label: "Organization Settlement", value: latest?.organization_settlement_account },
          ].map((b) => (
            <Card key={b.label} className="border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <CardDescription>{b.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatKES(b.value ?? null)}</div>
                {b.hint && <p className="text-xs text-muted-foreground mt-1">{b.hint}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status</CardTitle>
            <CardDescription>
              {latest?.completed_at
                ? `Last updated ${new Date(latest.completed_at).toLocaleString()}`
                : latest
                ? "Awaiting Safaricom callback…"
                : "No balance has been queried yet."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latest && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={latest.result_code === 0 ? "default" : "secondary"}>
                  {latest.result_code === 0 ? "OK" : latest.result_code == null ? "Pending" : `Code ${latest.result_code}`}
                </Badge>
                <span className="text-muted-foreground">{latest.result_desc ?? "—"}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Queries</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No queries yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md border bg-muted/30 text-sm">
                    <div className="font-mono">{new Date(h.queried_at).toLocaleString()}</div>
                    <div className="font-semibold">{formatKES(h.working_account)}</div>
                    <Badge variant={h.result_code === 0 ? "default" : "secondary"}>
                      {h.completed_at ? (h.result_code === 0 ? "Completed" : "Failed") : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminPaybillBalance;
