import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Search, X, Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface UnifiedTransaction {
  id: string;
  source: string;
  source_name: string;
  transaction_type: string;
  amount: number;
  commission: number;
  net_amount: number;
  status: string;
  payment_reference: string;
  mpesa_receipt: string | null;
  payment_method: string | null;
  created_at: string;
  completed_at: string | null;
  user_name: string;
  user_phone: string | null;
  user_email: string | null;
  user_id?: string;
  entity_id?: string;
}

export const TransactionsTable = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-transactions", {
        body: { limit: 200 },
      });
      if (error) throw error;
      setTransactions(data?.transactions || []);
    } catch (error: any) {
      console.error("Error fetching transactions:", error);
      toast({
        title: "Error",
        description: "Failed to load transactions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter((tx) => {
      const phone = tx.user_phone ? `+${tx.user_phone}` : "";
      return (
        (tx.user_name || "").toLowerCase().includes(q) ||
        (tx.user_email || "").toLowerCase().includes(q) ||
        phone.includes(q) ||
        (tx.user_phone || "").includes(q) ||
        (tx.payment_reference || "").toLowerCase().includes(q) ||
        (tx.mpesa_receipt || "").toLowerCase().includes(q) ||
        (tx.source || "").toLowerCase().includes(q) ||
        (tx.source_name || "").toLowerCase().includes(q)
      );
    });
  }, [transactions, searchQuery]);

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const headers = ["Date", "Source", "Entity", "Type", "User", "Phone", "Amount", "Commission", "Net", "Reference", "M-Pesa Receipt", "Status"];
      const rows = filteredTransactions.map((tx) => [
        new Date(tx.created_at).toLocaleDateString(),
        tx.source,
        tx.source_name,
        tx.transaction_type,
        tx.user_name,
        tx.user_phone ? `+${tx.user_phone}` : "",
        tx.amount,
        tx.commission,
        tx.net_amount,
        tx.payment_reference,
        tx.mpesa_receipt || "",
        tx.status,
      ]);
      const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Success", description: "Transactions exported to CSV" });
    } catch (error: any) {
      console.error("Export error:", error);
      toast({ title: "Error", description: "Failed to export transactions", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return null;
    return phone.startsWith("254") ? `+${phone}` : phone;
  };

  const getSourceVariant = (source: string) => {
    switch (source) {
      case "Organization": return "default";
      case "Mchango": return "secondary";
      case "Welfare": return "outline";
      case "Chama": return "default";
      default: return "outline";
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed": return "default" as const;
      case "pending": return "secondary" as const;
      case "failed": return "destructive" as const;
      default: return "outline" as const;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <CardTitle>All Transactions</CardTitle>
            <CardDescription>
              Unified view across all entities ({filteredTransactions.length}
              {searchQuery ? ` of ${transactions.length}` : ""})
            </CardDescription>
          </div>
          <Button onClick={exportToCSV} disabled={exporting} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone, name, reference, M-Pesa receipt, source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {searchQuery ? "No transactions match your search" : "No transactions found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => {
                  const phone = formatPhone(tx.user_phone);
                  return (
                    <TableRow key={`${tx.source}-${tx.id}`}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant={getSourceVariant(tx.source) as any}>{tx.source}</Badge>
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">{tx.source_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className={tx.user_id ? "cursor-pointer hover:underline" : ""}
                          onClick={() => tx.user_id && navigate(`/admin/user/${tx.user_id}`)}
                        >
                          <p className="font-medium text-sm">{tx.user_name}</p>
                          <p className="text-muted-foreground text-xs">{tx.user_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {phone ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {phone}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{tx.transaction_type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap text-right">
                        KES {Number(tx.amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>
                          <p className="text-muted-foreground truncate max-w-[140px]">{tx.payment_reference}</p>
                          {tx.mpesa_receipt && (
                            <p className="text-xs text-primary font-mono">{tx.mpesa_receipt}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
