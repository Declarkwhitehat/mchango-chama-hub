import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  FileCheck, 
  Activity, 
  DollarSign,
  ArrowRight,
  AlertCircle,
  PhoneCall,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    pendingKyc: 0,
    activeChamas: 0,
    activeOrganizations: 0,
    activeWelfares: 0,
    totalPlatformRevenue: 0,
    pendingWithdrawals: 0,
    pendingCallbacks: 0,
    recentTransactions: 0,
    pendingExecChanges: 0,
  });

  const fetchDashboardData = useCallback(async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) setLoading(true);
      else setRefreshing(true);

      const [
        usersResult,
        verifiedUsersResult,
        pendingKycResult,
        chamasResult,
        organizationsResult,
        welfaresResult,
        withdrawalsResult,
        callbacksResult,
        transactionsResult,
        ledgerResult,
        execChangesResult,
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'approved'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending').not('kyc_submitted_at', 'is', null),
        supabase.from('chama').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('welfares').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('customer_callbacks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('financial_ledger').select('commission_amount'),
        supabase.from('welfare_executive_changes').select('*', { count: 'exact', head: true }).eq('admin_decision', 'pending'),
      ]);

      const totalPlatformRevenue = ledgerResult.data?.reduce((sum, item) => sum + (item.commission_amount || 0), 0) || 0;

      setStats({
        totalUsers: usersResult.count || 0,
        verifiedUsers: verifiedUsersResult.count || 0,
        pendingKyc: pendingKycResult.count || 0,
        activeChamas: chamasResult.count || 0,
        activeOrganizations: organizationsResult.count || 0,
        activeWelfares: welfaresResult.count || 0,
        totalPlatformRevenue,
        pendingWithdrawals: withdrawalsResult.count || 0,
        pendingCallbacks: callbacksResult.count || 0,
        recentTransactions: transactionsResult.count || 0,
        pendingExecChanges: execChangesResult.count || 0,
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
      setRefreshing(false);
      setLastRefreshed(new Date());
    }
  }, []);

  // Initial fetch + 30-second auto-refresh interval
  useEffect(() => {
    fetchDashboardData();
    intervalRef.current = setInterval(() => fetchDashboardData(true), 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDashboardData]);

  const totalActiveGroups = stats.activeChamas + stats.activeOrganizations + stats.activeWelfares;
  const hasAlerts = stats.pendingKyc > 0 || stats.pendingWithdrawals > 0 || stats.pendingCallbacks > 0;

  if (loading) {
    return (
      <AdminLayout>
        <div className="container px-4 py-8 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
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
      <div className="container px-4 py-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back! Here's an overview of your platform.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Action Required Banner */}
        {hasAlerts && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-2 text-destructive font-medium text-sm">
              <AlertCircle className="h-4 w-4" />
              Action Required
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.pendingKyc > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => navigate("/admin/kyc")}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  {stats.pendingKyc} KYC pending
                </Button>
              )}
              {stats.pendingWithdrawals > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => navigate("/admin/withdrawals")}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  {stats.pendingWithdrawals} withdrawals pending
                </Button>
              )}
              {stats.pendingCallbacks > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => navigate("/admin/callbacks")}
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  {stats.pendingCallbacks} callbacks pending
                </Button>
              )}
            </div>
          </div>
        )}

        {/* 4 Key Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Users */}
          <Card className="border-l-4 border-l-primary hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Total Users</CardDescription>
                <Users className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.verifiedUsers} verified
              </p>
            </CardContent>
          </Card>

          {/* Active Groups */}
          <Card className="border-l-4 border-l-accent hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Active Groups</CardDescription>
                <Activity className="h-4 w-4 text-accent" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActiveGroups.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeChamas} Chamas · {stats.activeOrganizations} Orgs · {stats.activeWelfares} Welfares
              </p>
            </CardContent>
          </Card>

          {/* Platform Revenue */}
          <Card 
            className="border-l-4 border-l-secondary hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/commission-analytics")}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Platform Revenue</CardDescription>
                <DollarSign className="h-4 w-4 text-secondary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                KES {stats.totalPlatformRevenue.toLocaleString('en-KE', { maximumFractionDigits: 0 })}
              </div>
              <Button
                variant="link"
                className="p-0 h-auto text-xs"
                onClick={(e) => { e.stopPropagation(); navigate("/admin/commission-analytics"); }}
              >
                View breakdown <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card 
            className="border-l-4 border-l-muted-foreground hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/transactions")}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Recent Transactions</CardDescription>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.recentTransactions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">In the last 24 hours</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Detail Section */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/60">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <PlatformStatistics />
          </TabsContent>

          <TabsContent value="financial">
            <AdminFinancialOverview />
          </TabsContent>

          <TabsContent value="analytics">
            <EnhancedAnalytics />
          </TabsContent>

          <TabsContent value="system">
            <CleanupJobStatus />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
