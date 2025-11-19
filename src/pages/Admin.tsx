import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersManagement } from "@/components/admin/UsersManagement";
import { CampaignsManagement } from "@/components/admin/CampaignsManagement";
import { ChamaManagement } from "@/components/admin/ChamaManagement";
import { SavingsGroupManagement } from "@/components/admin/SavingsGroupManagement";
import { MemberVerification } from "@/components/admin/MemberVerification";
import { Users, TrendingUp, DollarSign, Activity, FileCheck, PiggyBank } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Load admin data on mount
  useEffect(() => {
    fetchAdminData();
  }, []);

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeCampaigns: 0,
    activeGroups: 0,
    activeSavingsGroups: 0,
    totalFundsRaised: 0,
    pendingKyc: 0,
  });

  const fetchAdminData = async () => {
    try {
      // Fetch total users count
      const { count: usersCount, error: usersError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (usersError) throw usersError;

      // Fetch active mchangos
      const { data: mchangos, error: mchangosError } = await supabase
        .from('mchango')
        .select('*')
        .eq('status', 'active');

      if (mchangosError) throw mchangosError;

      // Fetch active chamas
      const { data: chamas, error: chamasError } = await supabase
        .from('chama')
        .select('*')
        .eq('status', 'active');

      if (chamasError) throw chamasError;

      // Fetch active savings groups
      const { data: savingsGroups, error: savingsError } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('status', 'active');

      if (savingsError) throw savingsError;

      // Calculate total funds raised
      const totalFunds = mchangos?.reduce((sum, m) => sum + Number(m.current_amount || 0), 0) || 0;

      // Get pending KYC count
      const { count: pendingKycCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('kyc_status', 'pending')
        .not('kyc_submitted_at', 'is', null);

      setStats({
        totalUsers: usersCount || 0,
        activeCampaigns: mchangos?.length || 0,
        activeGroups: chamas?.length || 0,
        activeSavingsGroups: savingsGroups?.length || 0,
        totalFundsRaised: totalFunds,
        pendingKyc: pendingKycCount || 0,
      });

    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast({
        title: "Error",
        description: "Failed to load admin data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout showBackButton title="Admin Dashboard">
        <div className="container px-4 py-6 max-w-6xl mx-auto">
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showBackButton title="Admin Dashboard">
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.totalUsers.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending KYC</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.pendingKyc}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.activeCampaigns}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Chama Groups</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.activeGroups}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Savings Groups</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.activeSavingsGroups}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Funds Raised</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {(stats.totalFundsRaised / 1000000).toFixed(1)}M
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Views */}
        <Tabs defaultValue="kyc" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="kyc">
              KYC Queue
              {stats.pendingKyc > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {stats.pendingKyc}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="verification">Verification</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="groups">Chama Groups</TabsTrigger>
            <TabsTrigger value="savings">Savings Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="kyc">
            <Card>
              <CardHeader>
                <CardTitle>KYC Review Queue</CardTitle>
                <CardDescription>
                  {stats.pendingKyc} pending verification{stats.pendingKyc !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="default"
                  onClick={() => navigate("/admin/kyc")}
                  className="w-full"
                >
                  <FileCheck className="mr-2 h-4 w-4" />
                  Open KYC Review Page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/admin/dashboard")}
                  className="w-full"
                >
                  Advanced Search & Tools
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verification">
            <MemberVerification />
          </TabsContent>

          <TabsContent value="users">
            <UsersManagement />
          </TabsContent>

          <TabsContent value="campaigns">
            <CampaignsManagement />
          </TabsContent>

          <TabsContent value="groups">
            <ChamaManagement />
          </TabsContent>

          <TabsContent value="savings">
            <SavingsGroupManagement />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;