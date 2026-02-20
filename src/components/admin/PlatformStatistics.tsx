import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Users, TrendingUp, Building2, DollarSign, Loader2 } from "lucide-react";

interface Statistics {
  total_users: number;
  verified_users: number;
  total_chamas: number;
  active_chamas: number;
  chamas_today: number;
  total_campaigns: number;
  active_campaigns: number;
  campaigns_today: number;
  total_organizations: number;
  active_organizations: number;
  organizations_today: number;
  total_transactions: number;
  transaction_volume: number;
}

export const PlatformStatistics = () => {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const [
        { count: totalUsers },
        { count: verifiedUsers },
        { count: totalChamas },
        { count: activeChamas },
        { count: chamasToday },
        { count: totalCampaigns },
        { count: activeCampaigns },
        { count: campaignsToday },
        { count: totalOrganizations },
        { count: activeOrganizations },
        { count: organizationsToday },
        { count: totalTransactions },
        { data: transactionData }
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'approved'),
        supabase.from('chama').select('*', { count: 'exact', head: true }),
        supabase.from('chama').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('chama').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('mchango').select('*', { count: 'exact', head: true }),
        supabase.from('mchango').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('mchango').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('amount').eq('status', 'completed')
      ]);

      const transactionVolume = transactionData?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

      setStats({
        total_users: totalUsers || 0,
        verified_users: verifiedUsers || 0,
        total_chamas: totalChamas || 0,
        active_chamas: activeChamas || 0,
        chamas_today: chamasToday || 0,
        total_campaigns: totalCampaigns || 0,
        active_campaigns: activeCampaigns || 0,
        campaigns_today: campaignsToday || 0,
        total_organizations: totalOrganizations || 0,
        active_organizations: activeOrganizations || 0,
        organizations_today: organizationsToday || 0,
        total_transactions: totalTransactions || 0,
        transaction_volume: transactionVolume
      });

    } catch (error: any) {
      console.error('Error loading statistics:', error);
      toast({
        title: "Error",
        description: "Failed to load platform statistics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const TodayBadge = ({ count }: { count: number }) => (
    <span className={`text-xs font-medium ${count > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
      {count > 0 ? `+${count} today` : '0 today'}
    </span>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Overview</CardTitle>
        <CardDescription>Key statistics across the platform</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Users Stats */}
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Users</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.total_users.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.verified_users} verified
            </p>
          </div>

          {/* Chamas Stats */}
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Chama Groups</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.total_chamas.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.active_chamas} active
            </p>
            <TodayBadge count={stats.chamas_today} />
          </div>

          {/* Campaigns Stats */}
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Campaigns</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.total_campaigns.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.active_campaigns} active
            </p>
            <TodayBadge count={stats.campaigns_today} />
          </div>

          {/* Organizations Stats */}
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Organizations</p>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stats.total_organizations.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.active_organizations} active
            </p>
            <TodayBadge count={stats.organizations_today} />
          </div>

          {/* Transaction Stats */}
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Transaction Volume</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">
              KES {stats.transaction_volume.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.total_transactions} transactions
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
