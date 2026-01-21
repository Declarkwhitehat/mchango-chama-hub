import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Download, 
  Filter, 
  ArrowUpDown, 
  DollarSign, 
  CreditCard, 
  Gift, 
  History,
  Calendar,
  TrendingUp,
  X
} from "lucide-react";
import { format } from "date-fns";

interface FilterState {
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  status: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export default function MemberActivity() {
  const { groupId } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [membershipId, setMembershipId] = useState<string>("");
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [profitShares, setProfitShares] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    dateFrom: "",
    dateTo: "",
    minAmount: "",
    maxAmount: "",
    status: "all",
    sortBy: "date",
    sortOrder: "desc",
  });

  useEffect(() => {
    if (groupId) {
      fetchMemberData();
    }
  }, [groupId]);

  const fetchMemberData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get member ID
      const { data: member } = await supabase
        .from("saving_group_members")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", user.id)
        .single();

      if (!member) throw new Error("Member not found");
      setMembershipId(member.id);

      // Fetch all data in parallel
      const [depositsRes, loansRes, profitSharesRes, transactionsRes] = await Promise.all([
        supabase
          .from("saving_group_deposits")
          .select("*")
          .eq("saved_for_member_id", member.id)
          .order("created_at", { ascending: false }),
        
        supabase
          .from("saving_group_loans")
          .select("*")
          .eq("borrower_user_id", user.id)
          .eq("saving_group_id", groupId)
          .order("requested_at", { ascending: false }),
        
        supabase
          .from("saving_group_profit_shares")
          .select(`
            *,
            saving_group_profits!saving_group_profit_shares_profit_id_fkey(
              cycle_period,
              total_profit,
              distribution_date
            )
          `)
          .eq("member_id", member.id)
          .order("created_at", { ascending: false }),
        
        supabase
          .from("saving_group_transactions")
          .select("*")
          .eq("member_id", member.id)
          .order("created_at", { ascending: false })
      ]);

      if (depositsRes.error) throw depositsRes.error;
      if (loansRes.error) throw loansRes.error;
      if (profitSharesRes.error) throw profitSharesRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      setDeposits(depositsRes.data || []);
      setLoans(loansRes.data || []);
      setProfitShares(profitSharesRes.data || []);
      setTransactions(transactionsRes.data || []);
    } catch (error: any) {
      console.error("Error fetching member data:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load activity data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data: any[], type: 'deposits' | 'loans' | 'profitShares' | 'transactions') => {
    let filtered = [...data];

    // Date filter
    if (filters.dateFrom) {
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.created_at || item.requested_at);
        return itemDate >= new Date(filters.dateFrom);
      });
    }
    if (filters.dateTo) {
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.created_at || item.requested_at);
        return itemDate <= new Date(filters.dateTo);
      });
    }

    // Amount filter
    if (filters.minAmount) {
      filtered = filtered.filter(item => 
        (item.net_amount || item.requested_amount || item.share_amount || item.amount) >= Number(filters.minAmount)
      );
    }
    if (filters.maxAmount) {
      filtered = filtered.filter(item => 
        (item.net_amount || item.requested_amount || item.share_amount || item.amount) <= Number(filters.maxAmount)
      );
    }

    // Status filter
    if (filters.status !== "all") {
      if (type === 'loans') {
        filtered = filtered.filter(item => item.status === filters.status);
      } else if (type === 'profitShares') {
        filtered = filtered.filter(item => 
          filters.status === 'disbursed' ? item.disbursed : !item.disbursed
        );
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      if (filters.sortBy === 'date') {
        aVal = new Date(a.created_at || a.requested_at).getTime();
        bVal = new Date(b.created_at || b.requested_at).getTime();
      } else {
        aVal = a.net_amount || a.requested_amount || a.share_amount || a.amount || 0;
        bVal = b.net_amount || b.requested_amount || b.share_amount || b.amount || 0;
      }

      return filters.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  };

  const filteredDeposits = useMemo(() => applyFilters(deposits, 'deposits'), [deposits, filters]);
  const filteredLoans = useMemo(() => applyFilters(loans, 'loans'), [loans, filters]);
  const filteredProfitShares = useMemo(() => applyFilters(profitShares, 'profitShares'), [profitShares, filters]);
  const filteredTransactions = useMemo(() => applyFilters(transactions, 'transactions'), [transactions, filters]);

  const exportToCSV = (data: any[], filename: string, columns: { key: string; label: string }[]) => {
    const headers = columns.map(col => col.label).join(',');
    const rows = data.map(item => 
      columns.map(col => {
        const value = item[col.key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
        return value;
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `${filename} exported successfully`,
    });
  };

  const resetFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      minAmount: "",
      maxAmount: "",
      status: "all",
      sortBy: "date",
      sortOrder: "desc",
    });
  };

  const statistics = {
    totalDeposits: deposits.reduce((sum, d) => sum + (d.net_amount || 0), 0),
    totalLoans: loans.reduce((sum, l) => sum + (l.requested_amount || 0), 0),
    totalProfits: profitShares.reduce((sum, p) => sum + (p.share_amount || 0), 0),
    activeLoans: loans.filter(l => l.status === 'DISBURSED').length,
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">My Activity Dashboard</h1>
          <p className="text-muted-foreground">
            Complete history of your deposits, loans, profits, and transactions
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Deposits</p>
                <p className="text-2xl font-bold">KES {statistics.totalDeposits.toLocaleString()}</p>
              </div>
              <DollarSign className="h-10 w-10 text-primary opacity-20" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Loans</p>
                <p className="text-2xl font-bold">KES {statistics.totalLoans.toLocaleString()}</p>
              </div>
              <CreditCard className="h-10 w-10 text-primary opacity-20" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Profits</p>
                <p className="text-2xl font-bold text-primary">KES {statistics.totalProfits.toLocaleString()}</p>
              </div>
              <Gift className="h-10 w-10 text-primary opacity-20" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Active Loans</p>
                <p className="text-2xl font-bold">{statistics.activeLoans}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-primary opacity-20" />
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                <CardTitle>Filters & Export</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? 'Hide' : 'Show'} Filters
              </Button>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date To</Label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Amount</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={filters.minAmount}
                    onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Amount</Label>
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={filters.maxAmount}
                    onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort By</Label>
                  <Select value={filters.sortBy} onValueChange={(value) => setFilters({ ...filters, sortBy: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="amount">Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Select value={filters.sortOrder} onValueChange={(value: 'asc' | 'desc') => setFilters({ ...filters, sortOrder: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest First</SelectItem>
                      <SelectItem value="asc">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetFilters} size="sm">
                  <X className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Tabs for Different Activity Types */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="flex w-full overflow-x-auto scrollbar-hide gap-1 justify-start sm:grid sm:grid-cols-5">
            <TabsTrigger value="all" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              All
            </TabsTrigger>
            <TabsTrigger value="deposits" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Deposits</span>
              <span className="sm:hidden">Dep.</span> ({filteredDeposits.length})
            </TabsTrigger>
            <TabsTrigger value="loans" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              Loans ({filteredLoans.length})
            </TabsTrigger>
            <TabsTrigger value="profits" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Profits</span>
              <span className="sm:hidden">Prof.</span> ({filteredProfitShares.length})
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Transactions</span>
              <span className="sm:hidden">Txns</span> ({filteredTransactions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  All Activity
                </CardTitle>
                <CardDescription>Combined view of all your activities</CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertDescription>
                    Switch to individual tabs to view detailed activity and export data.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deposits">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Deposit History
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => exportToCSV(
                      filteredDeposits,
                      'deposits',
                      [
                        { key: 'created_at', label: 'Date' },
                        { key: 'gross_amount', label: 'Gross Amount' },
                        { key: 'commission_amount', label: 'Commission' },
                        { key: 'profit_fee', label: 'Profit Fee' },
                        { key: 'net_amount', label: 'Net Amount' },
                        { key: 'balance_after', label: 'Balance After' },
                      ]
                    )}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredDeposits.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No deposits found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Gross Amount</TableHead>
                        <TableHead>Deductions</TableHead>
                        <TableHead>Net Amount</TableHead>
                        <TableHead>Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeposits.map((deposit) => (
                        <TableRow key={deposit.id}>
                          <TableCell>{format(new Date(deposit.created_at), 'PPp')}</TableCell>
                          <TableCell className="font-semibold">KES {deposit.gross_amount.toLocaleString()}</TableCell>
                          <TableCell className="text-destructive">
                            - KES {((deposit.commission_amount || 0) + (deposit.profit_fee || 0)).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-semibold text-primary">KES {deposit.net_amount.toLocaleString()}</TableCell>
                          <TableCell>KES {deposit.balance_after?.toLocaleString() || 'N/A'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="loans">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Loan History
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => exportToCSV(
                      filteredLoans,
                      'loans',
                      [
                        { key: 'requested_at', label: 'Request Date' },
                        { key: 'requested_amount', label: 'Requested' },
                        { key: 'disbursed_amount', label: 'Disbursed' },
                        { key: 'balance_remaining', label: 'Balance' },
                        { key: 'status', label: 'Status' },
                        { key: 'due_date', label: 'Due Date' },
                      ]
                    )}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredLoans.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No loans found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request Date</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Disbursed</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLoans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell>{format(new Date(loan.requested_at), 'PP')}</TableCell>
                          <TableCell className="font-semibold">KES {loan.requested_amount.toLocaleString()}</TableCell>
                          <TableCell>KES {loan.disbursed_amount.toLocaleString()}</TableCell>
                          <TableCell className="font-semibold text-primary">
                            KES {loan.balance_remaining.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={loan.status === 'DISBURSED' ? 'default' : 'secondary'}>
                              {loan.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(loan.due_date), 'PP')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profits">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    Profit Shares
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => exportToCSV(
                      filteredProfitShares,
                      'profit_shares',
                      [
                        { key: 'created_at', label: 'Date' },
                        { key: 'share_amount', label: 'Amount' },
                        { key: 'savings_ratio', label: 'Savings Ratio' },
                        { key: 'disbursed', label: 'Status' },
                      ]
                    )}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredProfitShares.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No profit shares found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cycle Period</TableHead>
                        <TableHead>Share Amount</TableHead>
                        <TableHead>Savings Ratio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProfitShares.map((share) => (
                        <TableRow key={share.id}>
                          <TableCell>{share.saving_group_profits?.cycle_period || 'N/A'}</TableCell>
                          <TableCell className="font-semibold text-primary">
                            KES {share.share_amount.toLocaleString()}
                          </TableCell>
                          <TableCell>{(share.savings_ratio * 100).toFixed(2)}%</TableCell>
                          <TableCell>
                            <Badge variant={share.disbursed ? 'default' : 'secondary'}>
                              {share.disbursed ? 'Disbursed' : 'Pending'}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(share.created_at), 'PP')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Transaction History
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => exportToCSV(
                      filteredTransactions,
                      'transactions',
                      [
                        { key: 'created_at', label: 'Date' },
                        { key: 'transaction_type', label: 'Type' },
                        { key: 'amount', label: 'Amount' },
                        { key: 'notes', label: 'Notes' },
                      ]
                    )}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transactions found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((txn) => (
                        <TableRow key={txn.id}>
                          <TableCell>{format(new Date(txn.created_at), 'PPp')}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{txn.transaction_type}</Badge>
                          </TableCell>
                          <TableCell className={
                            txn.transaction_type.includes('DEPOSIT') || txn.transaction_type.includes('PROFIT')
                              ? 'font-semibold text-primary'
                              : 'font-semibold'
                          }>
                            KES {txn.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {txn.notes || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
