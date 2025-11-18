import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchBar } from "@/components/admin/SearchBar";
import { TransactionsTable } from "@/components/admin/TransactionsTable";
import { AuditLogsTable } from "@/components/admin/AuditLogsTable";
import { AccountAdjustment } from "@/components/admin/AccountAdjustment";
import { WithdrawalsManagement } from "@/components/admin/WithdrawalsManagement";
import { PlatformStatistics } from "@/components/admin/PlatformStatistics";
import { SavingsGroupManagement } from "@/components/admin/SavingsGroupManagement";
import { CommissionOverview } from "@/components/admin/CommissionOverview";
import { ChamaManagement } from "@/components/admin/ChamaManagement";
import { CustomerCallbacks } from "@/components/admin/CustomerCallbacks";
import { DataExport } from "@/components/admin/DataExport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Users, TrendingUp, Activity, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface SearchResults {
  users: any[];
  members: any[];
  mchangos: any[];
  chamas: any[];
  transactions: any[];
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (query: string, type: string) => {
    setIsSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Session Expired",
          description: "Please log in again to perform searches",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-search', {
        body: { query, type }
      });

      if (error) throw error;
      setSearchResults(data.data);
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to perform search",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchResults(null);
  };

  return (
    <Layout showBackButton title="Admin Dashboard">
      <div className="container px-4 py-8 max-w-[1600px] mx-auto space-y-8">
        {/* Header Section */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-lg text-muted-foreground">
            Complete platform management and analytics
          </p>
        </div>

        {/* Platform Statistics */}
        <PlatformStatistics />

        {/* Commission Overview - Prominent Position */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Platform Revenue</h2>
          </div>
          <CommissionOverview />
        </div>

        {/* Data Export Section */}
        <DataExport />

        {/* Global Search */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Search className="h-5 w-5 text-primary" />
              Universal Search
            </CardTitle>
            <CardDescription>
              Search users, member codes, mchango slugs, transaction IDs, and more
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SearchBar
              onSearch={handleSearch}
              onClear={handleClearSearch}
              isLoading={isSearching}
            />
          </CardContent>
        </Card>

        {/* Search Results */}
        {searchResults && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Search Results</h2>

            {/* Users Results */}
            {searchResults.users.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Users ({searchResults.users.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {searchResults.users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">{user.full_name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                            <span className="font-mono">ID: {user.id_number}</span>
                            <span>Phone: {user.phone}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            user.kyc_status === 'approved' ? 'default' :
                            user.kyc_status === 'rejected' ? 'destructive' : 'secondary'
                          }>
                            {user.kyc_status}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/user/${user.id}`)}>
                            View Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Members Results */}
            {searchResults.members.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Members ({searchResults.members.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {searchResults.members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">{member.member_code}</p>
                          <p className="text-sm text-muted-foreground">
                            {member.profiles?.full_name} • {member.chama?.name}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/chama/${member.chama?.slug}`)}>
                          View Chama
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mchangos Results */}
            {searchResults.mchangos.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Mchangos ({searchResults.mchangos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {searchResults.mchangos.map((mchango) => (
                      <div key={mchango.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">{mchango.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {mchango.slug} • KES {mchango.current_amount.toLocaleString()} / {mchango.target_amount.toLocaleString()}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => navigate(`/mchango/${mchango.slug}`)}>
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transactions Results */}
            {searchResults.transactions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Transactions ({searchResults.transactions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {searchResults.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">KES {tx.amount.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">
                            {tx.payment_reference} • {tx.profiles?.full_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                          {tx.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Results */}
            {searchResults.users.length === 0 &&
             searchResults.members.length === 0 &&
             searchResults.mchangos.length === 0 &&
             searchResults.chamas.length === 0 &&
             searchResults.transactions.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No results found</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Management Sections */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Platform Management</h2>
          </div>
          
          <Tabs defaultValue="savings" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-7 h-auto gap-2 bg-muted/50 p-2">
              <TabsTrigger value="savings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Savings Groups
              </TabsTrigger>
              <TabsTrigger value="chama" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Chama Groups
              </TabsTrigger>
              <TabsTrigger value="withdrawals" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Withdrawals
              </TabsTrigger>
              <TabsTrigger value="transactions" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Transactions
              </TabsTrigger>
              <TabsTrigger value="audit" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Audit Logs
              </TabsTrigger>
              <TabsTrigger value="adjustment" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Adjustments
              </TabsTrigger>
              <TabsTrigger value="callbacks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Callbacks
              </TabsTrigger>
            </TabsList>

            <TabsContent value="savings" className="mt-6">
              <SavingsGroupManagement />
            </TabsContent>

            <TabsContent value="chama" className="mt-6">
              <ChamaManagement />
            </TabsContent>

            <TabsContent value="withdrawals" className="mt-6">
              <WithdrawalsManagement />
            </TabsContent>

            <TabsContent value="transactions" className="mt-6">
              <TransactionsTable />
            </TabsContent>

            <TabsContent value="audit" className="mt-6">
              <AuditLogsTable />
            </TabsContent>

            <TabsContent value="adjustment" className="mt-6">
              <AccountAdjustment />
            </TabsContent>

            <TabsContent value="callbacks" className="mt-6">
              <CustomerCallbacks />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default AdminDashboard;
