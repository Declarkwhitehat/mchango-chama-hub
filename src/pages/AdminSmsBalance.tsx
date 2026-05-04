import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, MessageSquareMore, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type SmsBalanceResponse = {
  success?: boolean;
  provider?: string;
  balance?: string | number | null;
  currency?: string | null;
  checkedAt?: string;
  details?: string;
};

export default function AdminSmsBalance() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SmsBalanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async (isBackground = false) => {
    try {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("No active admin session found");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/sms-balance`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.details || result?.error || "Failed to fetch SMS balance");
      }

      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch SMS balance";
      setError(message);
      if (!isBackground) {
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const formattedBalance = useMemo(() => {
    if (data?.balance === null || data?.balance === undefined || data?.balance === "") return "—";
    return String(data.balance);
  }, [data]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="container px-4 py-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MessageSquareMore className="h-7 w-7" />
              SMS Balance
            </h1>
            <p className="text-muted-foreground">
              Monitor the remaining SMS credit from your messaging provider with automatic refresh.
            </p>
          </div>
          <Button variant="outline" onClick={() => fetchBalance(true)} disabled={refreshing} className="gap-2 w-full sm:w-auto">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh now
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Balance check failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardDescription>Provider</CardDescription>
              <CardTitle className="text-2xl">{data?.provider || "SMS Provider"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={error ? "destructive" : "secondary"}>
                {error ? "Check failed" : "Connected"}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Remaining balance</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Wallet className="h-6 w-6" />
                {formattedBalance}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {data?.currency || "KES"} • updates every 30 seconds while this page is open
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Live status</CardTitle>
            <CardDescription>Current refresh information for the admin team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Last checked</p>
                <p className="font-medium">{data?.checkedAt ? new Date(data.checkedAt).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Refresh state</p>
                <p className="font-medium">{refreshing ? "Refreshing…" : "Watching live"}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep this page open during campaigns or heavy SMS usage to watch the credit reduce in near real time.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
