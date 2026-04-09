import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ActivityPDFDownload } from "@/components/activity/ActivityPDFDownload";
import { 
  Loader2, 
  DollarSign, 
  TrendingUp,
  Users,
  Heart,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Building2
} from "lucide-react";
import { format } from "date-fns";

interface Transaction {
  id: string;
  type: 'chama' | 'mchango' | 'withdrawal' | 'organization';
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
  const [organizationTransactions, setOrganizationTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [chamaNames, setChamaNames] = useState<Map<string, string>>(new Map());
  const [mchangoNames, setMchangoNames] = useState<Map<string, string>>(new Map());
  const [organizationNames, setOrganizationNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchAllTransactions();
  }, []);

  const fetchAllTransactions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // First get the user's chama member IDs
      const { data: memberData } = await supabase
        .from("chama_members")
        .select("id, chama_id")
        .eq("user_id", user.id);

      const memberIds = memberData?.map(m => m.id) || [];

      // Fetch ALL transaction types in parallel using Promise.allSettled
      const [chamaResult, mchangoResult, orgResult, withdrawalResult] = await Promise.allSettled([
        // Chama contributions
        memberIds.length > 0
          ? supabase
              .from("contributions")
              .select("id, amount, status, created_at, chama_id, mpesa_receipt_number, member_id, chama:chama_id(name)")
              .in("member_id", memberIds)
              .order("created_at", { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [], error: null }),
        // Mchango donations
        supabase
          .from("mchango_donations")
          .select("id, amount, created_at, mchango_id, payment_status, payment_reference, mchango:mchango_id(title)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        // Organization donations
        supabase
          .from("organization_donations")
          .select("id, amount, created_at, organization_id, payment_status, mpesa_receipt_number, organization:organization_id(name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        // Withdrawals
        supabase
          .from("withdrawals")
          .select("id, amount, status, created_at, payment_reference")
          .eq("requested_by", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      // Process results safely
      const chamaData = chamaResult.status === 'fulfilled' && !chamaResult.value.error ? (chamaResult.value.data || []) : [];
      const mchangoData = mchangoResult.status === 'fulfilled' && !mchangoResult.value.error ? (mchangoResult.value.data || []) : [];
      const orgData = orgResult.status === 'fulfilled' && !orgResult.value.error ? (orgResult.value.data || []) : [];
      const withdrawalData = withdrawalResult.status === 'fulfilled' && !withdrawalResult.value.error ? (withdrawalResult.value.data || []) : [];

      // Build name maps from joined data
      const chamaNameMap = new Map<string, string>();
      chamaData.forEach((c: any) => { if (c.chama) chamaNameMap.set(c.chama_id, c.chama.name); });

      const mchangoNameMap = new Map<string, string>();
      mchangoData.forEach((m: any) => { if (m.mchango) mchangoNameMap.set(m.mchango_id, m.mchango.title); });

      const orgNameMap = new Map<string, string>();
      orgData.forEach((o: any) => { if (o.organization) orgNameMap.set(o.organization_id, o.organization.name); });

      setChamaNames(chamaNameMap);
      setMchangoNames(mchangoNameMap);
      setOrganizationNames(orgNameMap);
      setChamaTransactions(chamaData);
      setMchangoTransactions(mchangoData);
      setOrganizationTransactions(orgData);
      setWithdrawals(withdrawalData);

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
          status: t.payment_status || 'completed',
          created_at: t.created_at,
          description: `Campaign Donation - ${mchangoNameMap.get(t.mchango_id) || 'Unknown'}`,
          reference: t.payment_reference
        })),
        ...(orgData || []).map((t: any) => ({
          id: t.id,
          type: 'organization' as const,
          amount: t.amount,
          status: t.payment_status || 'completed',
          created_at: t.created_at,
          description: `Organization Donation - ${orgNameMap.get(t.organization_id) || 'Unknown'}`,
          reference: t.mpesa_receipt_number
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
      case 'organization': return <Building2 className="h-4 w-4" />;
      case 'withdrawal': return <ArrowDownLeft className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      chama: 'bg-primary/10 text-primary border-primary/20',
      mchango: 'bg-secondary/10 text-secondary border-secondary/20',
      organization: 'bg-accent/10 text-accent-foreground border-accent/20',
      withdrawal: 'bg-muted text-muted-foreground border-border'
    };
    const labels: Record<string, string> = {
      chama: 'Chama',
      mchango: 'Campaign',
      organization: 'Organization',
      withdrawal: 'Withdrawal'
    };
    return (
      <Badge variant="outline" className={variants[type]}>
        {labels[type] || type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      CONFIRMED: 'bg-primary/10 text-primary border-primary/20',
      completed: 'bg-primary/10 text-primary border-primary/20',
      PENDING: 'bg-secondary/10 text-secondary border-secondary/20',
      pending: 'bg-secondary/10 text-secondary border-secondary/20',
      FAILED: 'bg-destructive/10 text-destructive border-destructive/20',
      failed: 'bg-destructive/10 text-destructive border-destructive/20'
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
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
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
          <TabsList className="flex w-full overflow-x-auto scrollbar-hide gap-1 justify-start sm:grid sm:grid-cols-5">
            <TabsTrigger value="all" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              All ({transactions.length})
            </TabsTrigger>
            <TabsTrigger value="chama" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              Chama ({chamaTransactions.length})
            </TabsTrigger>
            <TabsTrigger value="mchango" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Campaigns</span>
              <span className="sm:hidden">Camp.</span> ({mchangoTransactions.length})
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Organizations</span>
              <span className="sm:hidden">Orgs</span> ({organizationTransactions.length})
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="flex-shrink-0 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Withdrawals</span>
              <span className="sm:hidden">W/D</span> ({withdrawals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>All Transactions</CardTitle>
                  <CardDescription>Complete history of all your financial activities</CardDescription>
                </div>
                <ActivityPDFDownload 
                  data={transactions} 
                  type="all" 
                  chamaNames={chamaNames}
                  mchangoNames={mchangoNames}
                />
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
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Chama Contributions
                  </CardTitle>
                  <CardDescription>All your chama group contributions</CardDescription>
                </div>
                <ActivityPDFDownload 
                  data={chamaTransactions} 
                  type="chama" 
                  chamaNames={chamaNames}
                />
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
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Campaign Donations
                  </CardTitle>
                  <CardDescription>All your campaign donations and contributions</CardDescription>
                </div>
                <ActivityPDFDownload 
                  data={mchangoTransactions} 
                  type="mchango" 
                  mchangoNames={mchangoNames}
                />
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

          <TabsContent value="organizations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Organization Donations
                  </CardTitle>
                  <CardDescription>All your donations to organizations (churches, schools, NGOs)</CardDescription>
                </div>
                <ActivityPDFDownload 
                  data={organizationTransactions} 
                  type="organizations" 
                  organizationNames={organizationNames}
                />
              </CardHeader>
              <CardContent>
                {organizationTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No organization donations found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Organization</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {organizationTransactions.map((transaction: any) => (
                          <TableRow key={transaction.id}>
                            <TableCell>{format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                            <TableCell>{organizationNames.get(transaction.organization_id) || 'Unknown'}</TableCell>
                            <TableCell className="font-semibold">KSh {transaction.amount.toLocaleString()}</TableCell>
                            <TableCell>{getStatusBadge(transaction.payment_status)}</TableCell>
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

          <TabsContent value="withdrawals">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowDownLeft className="h-5 w-5" />
                    Withdrawal History
                  </CardTitle>
                  <CardDescription>All your withdrawal requests and transactions</CardDescription>
                </div>
                <ActivityPDFDownload 
                  data={withdrawals} 
                  type="withdrawals"
                />
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
    </Layout>
  );
}
