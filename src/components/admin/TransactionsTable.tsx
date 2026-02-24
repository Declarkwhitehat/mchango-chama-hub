import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, ExternalLink, Search, X, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  payment_method: string;
  payment_reference: string;
  mpesa_receipt_number: string | null;
  status: string;
  created_at: string;
  mchango_id: string | null;
  chama_id: string | null;
  profiles?: {
    full_name: string;
    email: string;
    phone: string | null;
  };
}

export const TransactionsTable = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          profiles (
            full_name,
            email,
            phone
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
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
      const phone = tx.profiles?.phone ? `+${tx.profiles.phone}` : "";
      return (
        (tx.profiles?.full_name || "").toLowerCase().includes(q) ||
        (tx.profiles?.email || "").toLowerCase().includes(q) ||
        phone.includes(q) ||
        (tx.profiles?.phone || "").includes(q) ||
        (tx.payment_reference || "").toLowerCase().includes(q) ||
        (tx.mpesa_receipt_number || "").toLowerCase().includes(q) ||
        (tx.transaction_type || "").toLowerCase().includes(q)
      );
    });
  }, [transactions, searchQuery]);

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Session Expired", description: "Please log in again to export data", variant: "destructive" });
        navigate("/auth");
        return;
      }
      const { data, error } = await supabase.functions.invoke('admin-export', { body: { type: 'transactions' } });
      if (error) throw error;
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Success", description: "Transactions exported to CSV" });
    } catch (error: any) {
      console.error('Export error:', error);
      toast({ title: "Error", description: "Failed to export transactions", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return null;
    return phone.startsWith("254") ? `+${phone}` : phone;
  };

  if (loading) {
    return <p>Loading transactions...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>All platform transactions ({filteredTransactions.length}{searchQuery ? ` of ${transactions.length}` : ""})</CardDescription>
          </div>
          <Button onClick={exportToCSV} disabled={exporting} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone, name, reference, M-Pesa receipt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setSearchQuery("")}>
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
                <TableHead>User</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
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
                  const phone = formatPhone(tx.profiles?.phone);
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div
                          className={tx.user_id ? "cursor-pointer hover:underline" : ""}
                          onClick={() => tx.user_id && navigate(`/admin/user/${tx.user_id}`)}
                        >
                          <p className="font-medium text-sm">{tx.profiles?.full_name || 'Unknown'}</p>
                          <p className="text-muted-foreground text-xs">{tx.profiles?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {phone ? (
                          <div
                            className={`flex items-center gap-1 text-sm ${tx.user_id ? "cursor-pointer hover:underline text-primary" : "text-muted-foreground"}`}
                            onClick={() => tx.user_id && navigate(`/admin/user/${tx.user_id}`)}
                          >
                            <Phone className="h-3 w-3" />
                            {phone}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tx.transaction_type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        KES {tx.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>
                          <p className="text-muted-foreground">{tx.payment_reference}</p>
                          {tx.mpesa_receipt_number && (
                            <p className="text-xs text-primary font-mono">{tx.mpesa_receipt_number}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {tx.user_id ? (
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/user/${tx.user_id}`)}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">View</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
