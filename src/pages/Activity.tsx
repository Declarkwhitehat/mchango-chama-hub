import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  DollarSign, 
  TrendingUp,
  Users,
  Heart,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface Transaction {
  id: string;
  type: 'chama' | 'mchango' | 'savings' | 'withdrawal';
  amount: number;
  status: string;
  created_at: string;
  description: string;
  reference?: string;
}

export default function Activity() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chamaTransactions, setChamaTransactions] = useState<any[]>([]);
  const [mchangoTransactions, setMchangoTransactions] = useState<any[]>([]);
  const [savingsTransactions, setSavingsTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [chamaNames, setChamaNames] = useState<Map<string, string>>(new Map());
  const [mchangoNames, setMchangoNames] = useState<Map<string, string>>(new Map());
  const [savingsGroupNames, setSavingsGroupNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchAllTransactions();
  }, []);

  const fetchAllTransactions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch chama contributions
      const { data: chamaData, error: chamaError } = await (supabase as any)
        .from("chama_contributions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (chamaError) throw chamaError;

      // Fetch mchango donations
      const { data: mchangoData, error: mchangoError } = await (supabase as any)
        .from("mchango_donations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (mchangoError) throw mchangoError;

      // Fetch savings group member info
      const { data: memberData, error: memberError } = await supabase
        .from("saving_group_members")
        .select("id, group_id")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      const memberIds = memberData?.map(m => m.id) || [];
      const groupIds = memberData?.map(m => m.group_id) || [];

      // Fetch savings deposits
      let savingsData: any[] = [];
      if (memberIds.length > 0) {
        const { data, error: savingsError } = await (supabase as any)
          .from("saving_group_deposits")
          .select("*")
          .in("saved_for_member_id", memberIds)
          .order("created_at", { ascending: false });

        if (savingsError) throw savingsError;
        savingsData = data || [];
      }

      // Fetch withdrawals
      const { data: withdrawalData, error: withdrawalError } = await (supabase as any)
        .from("withdrawals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (withdrawalError) throw withdrawalError;

      // Fetch entity names
      const chamaIds = [...new Set((chamaData || []).map((c: any) => c.chama_id).filter(Boolean))];
      const mchangoIds = [...new Set((mchangoData || []).map((m: any) => m.mchango_id).filter(Boolean))];

      const chamaNameMap = new Map<string, string>();
      const mchangoNameMap = new Map<string, string>();
      const savingsNameMap = new Map<string, string>();

      if (chamaIds.length > 0) {
        const { data: chamasData } = await (supabase as any)
          .from("chamas")
          .select("id, name")
          .in("id", chamaIds);
        chamasData?.forEach((c: any) => chamaNameMap.set(c.id, c.name));
      }

      if (mchangoIds.length > 0) {
        const { data: mchangosData } = await (supabase as any)
          .from("mchangos")
          .select("id, title")
          .in("id", mchangoIds);
        mchangosData?.forEach((m: any) => mchangoNameMap.set(m.id, m.title));
      }

      if (groupIds.length > 0) {
        const { data: groupsData } = await (supabase as any)
          .from("saving_groups")
          .select("id, name")
          .in("id", groupIds);
        groupsData?.forEach((g: any) => savingsNameMap.set(g.id, g.name));
      }

      // Map member IDs to group names for savings deposits
      const memberToGroupName = new Map<string, string>();
      memberData?.forEach(m => {
        const groupName = savingsNameMap.get(m.group_id);
        if (groupName) memberToGroupName.set(m.id, groupName);
      });

      setChamaNames(chamaNameMap);
      setMchangoNames(mchangoNameMap);
      setSavingsGroupNames(memberToGroupName);
      setChamaTransactions(chamaData || []);
      setMchangoTransactions(mchangoData || []);
      setSavingsTransactions(savingsData);
      setWithdrawals(withdrawalData || []);

      // Combine all transactions
      const allTransactions: Transaction[] = [
        ...(chamaData || []).map((t: any) => ({
          id: t.id,
          type: 'chama' as const,
          amount: t.amount,
          status: t.status,
          created_at: t.created_at,
          description: `Chama Contribution - ${chamaNameMap.get(t.chama_id) || 'Unknown'}`,
          reference: t.mpesa_receipt_number
        })),
        ...(mchangoData || []).map((t: any) => ({
          id: t.id,
          type: 'mchango' as const,
          amount: t.amount,
          status: 'completed',
          created_at: t.created_at,
          description: `Campaign Donation - ${mchangoNameMap.get(t.mchango_id) || 'Unknown'}`,
          reference: t.payment_reference
        })),
        ...savingsData.map((t: any) => ({
          id: t.id,
          type: 'savings' as const,
          amount: t.net_amount,
          status: 'completed',
          created_at: t.created_at,
          description: `Savings Deposit - ${memberToGroupName.get(t.saved_for_member_id) || 'Unknown'}`,
          reference: t.mpesa_receipt_number || 'N/A'
        })),
        ...(withdrawalData || []).map((t: any) => ({
          id: t.id,
          type: 'withdrawal' as const,
          amount: t.amount,
          status: t.status,
          created_at: t.created_at,
          description: 'Withdrawal Request',
          reference: t.payment_reference
        }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTransactions(allTransactions);
    } catch (error: any) {
      console.error("Error fetching transactions:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load activity data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'chama': return <Users className="h-4 w-4" />;
      case 'mchango': return <Heart className="h-4 w-4" />;
      case 'savings': return <PiggyBank className="h-4 w-4" />;
      case 'withdrawal': return <ArrowDownLeft className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      chama: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      mchango: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
      savings: 'bg-green-500/10 text-green-500 border-green-500/20',
      withdrawal: 'bg-orange-500/10 text-orange-500 border-orange-500/20'
    };
    return (
      <Badge variant="outline" className={variants[type]}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      CONFIRMED: 'bg-green-500/10 text-green-500 border-green-500/20',
      completed: 'bg-green-500/10 text-green-500 border-green-500/20',
      PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      FAILED: 'bg-red-500/10 text-red-500 border-red-500/20',
      failed: 'bg-red-500/10 text-red-500 border-red-500/20'
    };
    return (
      <Badge variant="outline" className={variants[status] || ''}>
        {status}
      </Badge>
    );
  };

  const statistics = {
    totalSpent: transactions
      .filter(t => t.type !== 'withdrawal' && (t.status === 'CONFIRMED' || t.status === 'completed'))
      .reduce((sum, t) => sum + t.amount, 0),
    totalWithdrawn: withdrawals
      .filter(w => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0),
    totalTransactions: transactions.length,
    pendingTransactions: transactions.filter(t => t.status === 'PENDING' || t.status === 'pending').length
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-12 mt-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8 mt-16 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Activity & Payments
          </h1>
          <p className="text-muted-foreground">
            Track all your transactions, contributions, and financial activities
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Spent</p>
                  <p className="text-2xl font-bold">KSh {statistics.totalSpent.toLocaleString()}</p>
                </div>
                <ArrowUpRight className="h-10 w-10 text-primary opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-secondary/20 bg-gradient-to-br from-secondary/5 to-transparent">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Withdrawn</p>
                  <p className="text-2xl font-bold">KSh {statistics.totalWithdrawn.toLocaleString()}</p>
                </div>
                <ArrowDownLeft className="h-10 w-10 text-secondary opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Transactions</p>
                  <p className="text-2xl font-bold">{statistics.totalTransactions}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-muted-foreground opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Pending</p>
                  <p className="text-2xl font-bold text-yellow-500">{statistics.pendingTransactions}</p>
                </div>
                <Calendar className="h-10 w-10 text-yellow-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All ({transactions.length})</TabsTrigger>
            <TabsTrigger value="chama">Chama ({chamaTransactions.length})</TabsTrigger>
            <TabsTrigger value="mchango">Campaigns ({mchangoTransactions.length})</TabsTrigger>
            <TabsTrigger value="savings">Savings ({savingsTransactions.length})</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals ({withdrawals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle>All Transactions</CardTitle>
                <CardDescription>Complete history of all your financial activities</CardDescription>
              </CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transactions found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((transaction) => (
                          <TableRow key={`${transaction.type}-${transaction.id}`}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTypeIcon(transaction.type)}
                                {getTypeBadge(transaction.type)}
                              </div>
                            </TableCell>
                            <TableCell>{transaction.description}</TableCell>
                            <TableCell className="font-semibold">
                              KSh {transaction.amount.toLocaleString()}
                            </TableCell>
                            <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {transaction.reference || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chama">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Chama Contributions
                </CardTitle>
                <CardDescription>All your chama group contributions</CardDescription>
              </CardHeader>
              <CardContent>
                {chamaTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No chama contributions found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Chama</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chamaTransactions.map((transaction: any) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                            <TableCell>{chamaNames.get(transaction.chama_id) || 'Unknown'}</TableCell>
                            <TableCell className="font-semibold">KSh {transaction.amount.toLocaleString()}</TableCell>
                            <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {transaction.mpesa_receipt_number || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mchango">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  Campaign Donations
                </CardTitle>
                <CardDescription>All your campaign donations and contributions</CardDescription>
              </CardHeader>
              <CardContent>
                {mchangoTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No campaign donations found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Campaign</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mchangoTransactions.map((transaction: any) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                            <TableCell>{mchangoNames.get(transaction.mchango_id) || 'Unknown'}</TableCell>
                            <TableCell className="font-semibold">KSh {transaction.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {transaction.payment_reference || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="savings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5" />
                  Savings Deposits
                </CardTitle>
                <CardDescription>All your savings group deposits</CardDescription>
              </CardHeader>
              <CardContent>
                {savingsTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No savings deposits found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Savings Group</TableHead>
                          <TableHead>Gross Amount</TableHead>
                          <TableHead>Net Amount</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {savingsTransactions.map((transaction: any) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                            <TableCell>{savingsGroupNames.get(transaction.saved_for_member_id) || 'Unknown'}</TableCell>
                            <TableCell>KSh {(transaction.gross_amount || 0).toLocaleString()}</TableCell>
                            <TableCell className="font-semibold">KSh {transaction.net_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {transaction.mpesa_receipt_number || 'N/A'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdrawals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownLeft className="h-5 w-5" />
                  Withdrawal History
                </CardTitle>
                <CardDescription>All your withdrawal requests and transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {withdrawals.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No withdrawals found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Processed At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals.map((withdrawal: any) => (
                          <TableRow key={withdrawal.id}>
                            <TableCell>{format(new Date(withdrawal.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                            <TableCell className="font-semibold">KSh {withdrawal.amount.toLocaleString()}</TableCell>
                            <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {withdrawal.payment_reference || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {withdrawal.completed_at ? format(new Date(withdrawal.completed_at), 'MMM dd, yyyy HH:mm') : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
