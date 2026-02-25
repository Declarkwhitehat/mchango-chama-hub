import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  FileCheck, 
  TrendingUp, 
  Activity, 
  DollarSign,
  ArrowRight,
  AlertCircle,
  PhoneCall,
  CreditCard,
  Building2,
  Shield
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { EnhancedAnalytics } from "@/components/admin/EnhancedAnalytics";
import { PlatformStatistics } from "@/components/admin/PlatformStatistics";
import { AdminFinancialOverview } from "@/components/admin/AdminFinancialOverview";
import { CleanupJobStatus } from "@/components/admin/CleanupJobStatus";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    pendingKyc: 0,
    activeCampaigns: 0,
    activeChamas: 0,
    activeOrganizations: 0,
    activeWelfares: 0,
    totalRevenue: 0,
    pendingWithdrawals: 0,
    pendingCallbacks: 0,
    recentTransactions: 0,
    totalPlatformRevenue: 0,
    chamasToday: 0,
    campaignsToday: 0,
    organizationsToday: 0,
    welfaresToday: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      // Fetch all data in parallel
      const [
        usersResult,
        verifiedUsersResult,
        pendingKycResult,
        campaignsResult,
        chamasResult,
        organizationsResult,
        welfaresResult,
        revenueResult,
        withdrawalsResult,
        callbacksResult,
        transactionsResult,
        ledgerResult,
        chamasTodayResult,
        campaignsTodayResult,
        organizationsTodayResult,
        welfaresTodayResult
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'approved'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending').not('kyc_submitted_at', 'is', null),
        supabase.from('mchango').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('chama').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('welfares').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('company_earnings').select('amount'),
        supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('customer_callbacks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('financial_ledger').select('commission_amount'),
        supabase.from('chama').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('mchango').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('welfares').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
      ]);

      const totalRevenue = revenueResult.data?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
      const totalPlatformRevenue = ledgerResult.data?.reduce((sum, item) => sum + (item.commission_amount || 0), 0) || 0;

      setStats({
        totalUsers: usersResult.count || 0,
        verifiedUsers: verifiedUsersResult.count || 0,
        pendingKyc: pendingKycResult.count || 0,
        activeCampaigns: campaignsResult.count || 0,
        activeChamas: chamasResult.count || 0,
        activeOrganizations: organizationsResult.count || 0,
        activeWelfares: welfaresResult.count || 0,
        totalRevenue,
        pendingWithdrawals: withdrawalsResult.count || 0,
        pendingCallbacks: callbacksResult.count || 0,
        recentTransactions: transactionsResult.count || 0,
        totalPlatformRevenue,
        chamasToday: chamasTodayResult.count || 0,
        campaignsToday: campaignsTodayResult.count || 0,
        organizationsToday: organizationsTodayResult.count || 0,
        welfaresToday: welfaresTodayResult.count || 0,
      });
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="container px-4 py-8 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome back! Here's an overview of your platform.
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Users */}
          <Card className="border-l-4 border-l-primary hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Total Users</CardDescription>
                <Users className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalUsers.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.verifiedUsers} verified
              </p>
            </CardContent>
          </Card>

          {/* Pending KYC */}
          <Card className="border-l-4 border-l-destructive hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Pending KYC</CardDescription>
                <FileCheck className="h-5 w-5 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.pendingKyc}</div>
              <Button
                variant="link"
                className="p-0 h-auto mt-2 text-sm"
                onClick={() => navigate("/admin/kyc")}
              >
                Review now <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          {/* Active Groups */}
          <Card className="border-l-4 border-l-accent hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Active Groups</CardDescription>
                <Activity className="h-5 w-5 text-accent" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(stats.activeChamas + stats.activeOrganizations + stats.activeWelfares).toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.activeChamas} Chamas, {stats.activeOrganizations} Orgs, {stats.activeWelfares} Welfares
              </p>
              {(stats.chamasToday + stats.organizationsToday + stats.welfaresToday) > 0 && (
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                  +{stats.chamasToday + stats.organizationsToday + stats.welfaresToday} today
                </p>
              )}
            </CardContent>
          </Card>

          {/* Total Platform Revenue */}
          <Card 
            className="border-l-4 border-l-secondary hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/commission-analytics")}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardDescription>Total Platform Revenue</CardDescription>
                <DollarSign className="h-5 w-5 text-secondary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                KES {stats.totalPlatformRevenue.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
              </div>
              <Button
                variant="link"
                className="p-0 h-auto mt-2 text-sm"
                onClick={(e) => { e.stopPropagation(); navigate("/admin/commission-analytics"); }}
              >
                View detailed breakdown <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            onClick={() => navigate("/admin/kyc")}
            className="h-auto py-6 flex flex-col items-start gap-2 bg-gradient-to-br from-primary to-primary-glow hover:shadow-lg"
          >
            <FileCheck className="h-5 w-5" />
            <span className="font-semibold">Review KYC</span>
            {stats.pendingKyc > 0 && (
              <Badge variant="secondary">{stats.pendingKyc} pending</Badge>
            )}
          </Button>

          <Button
            onClick={() => navigate("/admin/withdrawals")}
            variant="outline"
            className="h-auto py-6 flex flex-col items-start gap-2 hover:bg-accent/10 hover:border-accent"
          >
            <CreditCard className="h-5 w-5" />
            <span className="font-semibold">Withdrawals</span>
            {stats.pendingWithdrawals > 0 && (
              <Badge variant="destructive">{stats.pendingWithdrawals} pending</Badge>
            )}
          </Button>

          <Button
            onClick={() => navigate("/admin/callbacks")}
            variant="outline"
            className="h-auto py-6 flex flex-col items-start gap-2 hover:bg-accent/10 hover:border-accent"
          >
            <PhoneCall className="h-5 w-5" />
            <span className="font-semibold">Support Callbacks</span>
            {stats.pendingCallbacks > 0 && (
              <Badge variant="destructive">{stats.pendingCallbacks} pending</Badge>
            )}
          </Button>

          <Button
            onClick={() => navigate("/admin/transactions")}
            variant="outline"
            className="h-auto py-6 flex flex-col items-start gap-2 hover:bg-accent/10 hover:border-accent"
          >
            <Activity className="h-5 w-5" />
            <span className="font-semibold">Recent Activity</span>
            <span className="text-sm text-muted-foreground">{stats.recentTransactions} today</span>
          </Button>
        </div>

        {/* Financial Overview - Client Funds vs Platform Revenue */}
        <AdminFinancialOverview />

        {/* Platform Statistics */}
        <PlatformStatistics />

        {/* Commission Analytics accessible via Total Platform Revenue card */}

        {/* Enhanced Analytics */}
        <EnhancedAnalytics />

        {/* Cleanup Job Status */}
        <CleanupJobStatus />

        {/* Platform Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Campaigns Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Campaigns
                  </CardTitle>
                  <CardDescription className="mt-1">Active fundraising campaigns</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/campaigns")}>
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{stats.activeCampaigns}</div>
              <p className="text-sm text-muted-foreground">Active campaigns</p>
              {stats.campaignsToday > 0 && (
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                  +{stats.campaignsToday} today
                </p>
              )}
            </CardContent>
          </Card>

          {/* Organizations Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Organizations
                  </CardTitle>
                  <CardDescription className="mt-1">NGOs, Churches, Schools</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/organizations")}>
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{stats.activeOrganizations}</div>
              <p className="text-sm text-muted-foreground">Active organizations</p>
              {stats.organizationsToday > 0 && (
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                  +{stats.organizationsToday} today
                </p>
              )}
            </CardContent>
          </Card>
          {/* Welfare Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Welfare Groups
                  </CardTitle>
                  <CardDescription className="mt-1">Community welfare groups</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{stats.activeWelfares}</div>
              <p className="text-sm text-muted-foreground">Active welfare groups</p>
              {stats.welfaresToday > 0 && (
                <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                  +{stats.welfaresToday} today
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        {(stats.pendingKyc > 0 || stats.pendingWithdrawals > 0 || stats.pendingCallbacks > 0) && (
          <Card className="border-l-4 border-l-destructive bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Attention Required
              </CardTitle>
              <CardDescription>Items that need your immediate attention</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.pendingKyc > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div>
                    <p className="font-medium">KYC Verifications</p>
                    <p className="text-sm text-muted-foreground">{stats.pendingKyc} pending verification</p>
                  </div>
                  <Button size="sm" onClick={() => navigate("/admin/kyc")}>
                    Review
                  </Button>
                </div>
              )}
              {stats.pendingWithdrawals > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div>
                    <p className="font-medium">Withdrawal Requests</p>
                    <p className="text-sm text-muted-foreground">{stats.pendingWithdrawals} pending approval</p>
                  </div>
                  <Button size="sm" onClick={() => navigate("/admin/withdrawals")}>
                    Process
                  </Button>
                </div>
              )}
              {stats.pendingCallbacks > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div>
                    <p className="font-medium">Customer Callbacks</p>
                    <p className="text-sm text-muted-foreground">{stats.pendingCallbacks} awaiting response</p>
                  </div>
                  <Button size="sm" onClick={() => navigate("/admin/callbacks")}>
                    View
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
