import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  payment_method: string;
  payment_reference: string;
  status: string;
  created_at: string;
  mchango_id: string | null;
  chama_id: string | null;
  profiles?: {
    full_name: string;
    email: string;
  };
}

export const TransactionsTable = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

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
            email
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

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Session Expired",
          description: "Please log in again to export data",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-export', {
        body: { type: 'transactions' },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
      });

      if (error) throw error;

      // Create and download CSV
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Transactions exported to CSV",
      });
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export transactions",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p>Loading transactions...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>All platform transactions</CardDescription>
          </div>
          <Button onClick={exportToCSV} disabled={exporting} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{tx.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-muted-foreground text-xs">{tx.profiles?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tx.transaction_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      KES {tx.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.payment_reference}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`#transaction-${tx.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
