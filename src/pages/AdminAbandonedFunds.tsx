import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2, Search, Wallet } from "lucide-react";
import { format } from "date-fns";

type Row = {
  id: string;
  source_type: string;
  source_id: string | null;
  source_name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  gross_amount: number;
  net_swept_to_revenue: number;
  reason: string;
  metadata: Record<string, unknown>;
  swept_at: string;
};

const REASON_LABEL: Record<string, string> = {
  creator_deleted_expired_campaign: "Creator deleted expired campaign",
  account_deleted_with_balance: "Account deleted with balance",
  admin_deleted: "Admin deletion",
};

export default function AdminAbandonedFunds() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("abandoned_funds_ledger" as any)
        .select("*")
        .order("swept_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load abandoned funds ledger");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== "all" && r.source_type !== sourceFilter) return false;
      if (!needle) return true;
      return (
        (r.source_name || "").toLowerCase().includes(needle) ||
        (r.owner_name || "").toLowerCase().includes(needle) ||
        (r.owner_phone || "").toLowerCase().includes(needle) ||
        (r.owner_email || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, sourceFilter]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, r) => s + Number(r.net_swept_to_revenue || 0), 0);
    const thisMonth = filtered
      .filter((r) => new Date(r.swept_at).getMonth() === new Date().getMonth()
                  && new Date(r.swept_at).getFullYear() === new Date().getFullYear())
      .reduce((s, r) => s + Number(r.net_swept_to_revenue || 0), 0);
    return { total, thisMonth, count: filtered.length };
  }, [filtered]);

  const exportCsv = () => {
    const header = [
      "Swept at", "Source type", "Source name", "Owner", "Phone", "Email",
      "Amount (KES)", "Reason", "Source ID",
    ];
    const csv = [header.join(",")].concat(
      filtered.map((r) => [
        new Date(r.swept_at).toISOString(),
        r.source_type,
        JSON.stringify(r.source_name || ""),
        JSON.stringify(r.owner_name || ""),
        r.owner_phone || "",
        r.owner_email || "",
        Number(r.net_swept_to_revenue || 0),
        r.reason,
        r.source_id || "",
      ].join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abandoned-funds-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-7 w-7" /> Abandoned Funds Ledger
          </h1>
          <p className="text-muted-foreground">
            Money forfeited to platform revenue when creators delete expired campaigns or
            accounts are deleted while still holding a balance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total swept (filtered)</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">KES {totals.total.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>This month</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">KES {totals.thisMonth.toLocaleString()}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Events</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{totals.count}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Records</CardTitle>
            <CardDescription>Most recent 500 forfeiture events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by owner name, phone, email, source name..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full md:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="mchango">Mchango</SelectItem>
                  <SelectItem value="welfare">Welfare</SelectItem>
                  <SelectItem value="chama">Chama</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="user_account">User account</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <AlertTriangle className="h-8 w-8" />
                No abandoned funds recorded.
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="text-right">Amount (KES)</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(r.swept_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{r.source_name || "—"}</span>
                            <Badge variant="outline" className="w-fit mt-1">{r.source_type}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span className="font-medium">{r.owner_name || "—"}</span>
                            <span className="text-muted-foreground">{r.owner_phone || r.owner_email || ""}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {Number(r.net_swept_to_revenue || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {REASON_LABEL[r.reason] || r.reason}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
