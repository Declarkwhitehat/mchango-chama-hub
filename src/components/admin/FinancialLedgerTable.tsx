import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Search, Filter } from "lucide-react";
import { toast } from "sonner";

interface LedgerEntry {
  id: string;
  created_at: string;
  transaction_type: string;
  source_type: string;
  source_id: string;
  reference_id: string | null;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  commission_rate: number;
  payer_name: string | null;
  payer_phone: string | null;
  description: string | null;
}

interface LedgerSummary {
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  transactionCount: number;
}

export const FinancialLedgerTable = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<LedgerSummary>({
    totalGross: 0,
    totalCommission: 0,
    totalNet: 0,
    transactionCount: 0
  });
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchLedgerEntries();
  }, [sourceFilter, typeFilter]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('financial_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (sourceFilter !== "all") {
        query = query.eq('source_type', sourceFilter);
      }

      if (typeFilter !== "all") {
        query = query.eq('transaction_type', typeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      setEntries(data || []);

      // Calculate summary
      const summaryData = (data || []).reduce(
        (acc, entry) => ({
          totalGross: acc.totalGross + Number(entry.gross_amount),
          totalCommission: acc.totalCommission + Number(entry.commission_amount),
          totalNet: acc.totalNet + Number(entry.net_amount),
          transactionCount: acc.transactionCount + 1
        }),
        { totalGross: 0, totalCommission: 0, totalNet: 0, transactionCount: 0 }
      );

      setSummary(summaryData);
    } catch (error: any) {
      console.error('Error fetching ledger:', error);
      toast.error("Failed to load financial ledger");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Source', 'Payer', 'Gross', 'Commission', 'Rate', 'Net', 'Description'];
    const rows = entries.map(entry => [
      new Date(entry.created_at).toLocaleDateString(),
      entry.transaction_type,
      entry.source_type,
      entry.payer_name || 'N/A',
      entry.gross_amount,
      entry.commission_amount,
      `${(entry.commission_rate * 100).toFixed(0)}%`,
      entry.net_amount,
      entry.description || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-ledger-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success("Ledger exported successfully");
  };

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  const getSourceBadgeVariant = (source: string) => {
    switch (source) {
      case 'organization': return 'default';
      case 'mchango': return 'secondary';
      case 'chama': return 'outline';
      default: return 'default';
    }
  };

  const filteredEntries = entries.filter(entry => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      entry.payer_name?.toLowerCase().includes(search) ||
      entry.payer_phone?.includes(search) ||
      entry.description?.toLowerCase().includes(search)
    );
  });

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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Gross Collected</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.totalGross)}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Platform Commission</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(summary.totalCommission)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Client Funds</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.totalNet)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Transactions</p>
            <p className="text-2xl font-bold text-foreground">{summary.transactionCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Financial Ledger</CardTitle>
              <CardDescription>Complete transaction history with commission breakdown</CardDescription>
            </div>
            <Button onClick={exportToCSV} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by payer name, phone, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="organization">Organizations</SelectItem>
                <SelectItem value="mchango">Mchango</SelectItem>
                <SelectItem value="chama">Chama</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="donation">Donations</SelectItem>
                <SelectItem value="contribution">Contributions</SelectItem>
                <SelectItem value="withdrawal">Withdrawals</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {entry.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSourceBadgeVariant(entry.source_type)} className="capitalize">
                          {entry.source_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.payer_name || 'Anonymous'}</p>
                          {entry.payer_phone && (
                            <p className="text-xs text-muted-foreground">{entry.payer_phone}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(entry.gross_amount))}
                      </TableCell>
                      <TableCell className="text-right text-primary font-medium">
                        {formatCurrency(Number(entry.commission_amount))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(Number(entry.commission_rate) * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(entry.net_amount))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
