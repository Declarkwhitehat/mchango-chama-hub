import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  DollarSign, 
  TrendingUp, 
  Wallet, 
  Clock, 
  Users,
  Building2,
  Coins
} from "lucide-react";

interface FinancialData {
  mchango: {
    grossCollected: number;
    commission: number;
    clientFunds: number;
    pendingWithdrawals: number;
  };
  chama: {
    grossCollected: number;
    commission: number;
    clientFunds: number;
  };
  organizations: {
    grossCollected: number;
    commission: number;
    clientFunds: number;
    pendingWithdrawals: number;
  };
  totals: {
    grossCollected: number;
    platformRevenue: number;
    clientFundsHeld: number;
    pendingWithdrawals: number;
  };
}

export const AdminFinancialOverview = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FinancialData | null>(null);

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const fetchFinancialData = async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel
      const [
        mchangoResult,
        mchangoDonationsResult,
        chamaContributionsResult,
        organizationsResult,
        orgDonationsResult,
        pendingWithdrawalsResult,
        companyEarningsResult
      ] = await Promise.all([
        // Mchango totals
        supabase.from('mchango').select('total_gross_collected, total_commission_paid, available_balance'),
        // Mchango donations for accurate totals
        supabase.from('mchango_donations').select('gross_amount, commission_amount, net_amount').eq('payment_status', 'completed'),
        // Chama contributions
        supabase.from('contributions').select('amount').eq('status', 'completed'),
        // Organizations totals
        supabase.from('organizations').select('total_gross_collected, total_commission_paid, available_balance'),
        // Organization donations for accurate totals
        supabase.from('organization_donations').select('gross_amount, commission_amount, net_amount').eq('payment_status', 'completed'),
        // Pending withdrawals
        supabase.from('withdrawals').select('net_amount, mchango_id, chama_id').eq('status', 'pending'),
        // Company earnings by source
        supabase.from('company_earnings').select('source, amount')
      ]);

      // Calculate Mchango totals
      const mchangoGross = mchangoDonationsResult.data?.reduce((sum, d) => sum + (d.gross_amount || d.net_amount || 0), 0) || 0;
      const mchangoCommission = mchangoDonationsResult.data?.reduce((sum, d) => sum + (d.commission_amount || 0), 0) || 0;
      const mchangoClient = mchangoGross - mchangoCommission;
      const mchangoPendingWithdrawals = pendingWithdrawalsResult.data?.filter(w => w.mchango_id).reduce((sum, w) => sum + (w.net_amount || 0), 0) || 0;

      // Calculate Chama totals (5% commission)
      const chamaGross = chamaContributionsResult.data?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
      const chamaCommission = companyEarningsResult.data?.filter(e => e.source === 'chama_contribution').reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      const chamaClient = chamaGross - chamaCommission;

      // Calculate Organizations totals
      const orgGross = orgDonationsResult.data?.reduce((sum, d) => sum + (d.gross_amount || d.net_amount || 0), 0) || 0;
      const orgCommission = orgDonationsResult.data?.reduce((sum, d) => sum + (d.commission_amount || 0), 0) || 0;
      const orgClient = orgGross - orgCommission;
      const orgPendingWithdrawals = 0; // Organizations don't have withdrawal tracking yet

      // Calculate totals
      const totalGross = mchangoGross + chamaGross + orgGross;
      const totalCommission = mchangoCommission + chamaCommission + orgCommission;
      const totalClient = mchangoClient + chamaClient + orgClient;
      const totalPending = mchangoPendingWithdrawals + orgPendingWithdrawals + 
        (pendingWithdrawalsResult.data?.filter(w => w.chama_id).reduce((sum, w) => sum + (w.net_amount || 0), 0) || 0);

      setData({
        mchango: {
          grossCollected: mchangoGross,
          commission: mchangoCommission,
          clientFunds: mchangoClient,
          pendingWithdrawals: mchangoPendingWithdrawals,
        },
        chama: {
          grossCollected: chamaGross,
          commission: chamaCommission,
          clientFunds: chamaClient,
        },
        organizations: {
          grossCollected: orgGross,
          commission: orgCommission,
          clientFunds: orgClient,
          pendingWithdrawals: orgPendingWithdrawals,
        },
        totals: {
          grossCollected: totalGross,
          platformRevenue: totalCommission,
          clientFundsHeld: totalClient,
          pendingWithdrawals: totalPending,
        },
      });
    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatShort = (amount: number) => {
    if (amount >= 1000000) return `KES ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `KES ${(amount / 1000).toFixed(1)}K`;
    return formatCurrency(amount);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />
          Financial Overview
        </h2>
        <p className="text-muted-foreground">
          Real-time separation of client funds and platform revenue
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Collections */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <TrendingUp className="h-4 w-4" />
              Total Collections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {formatShort(data.totals.grossCollected)}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              All gross payments received
            </p>
          </CardContent>
        </Card>

        {/* Platform Revenue */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <DollarSign className="h-4 w-4" />
              Platform Revenue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {formatShort(data.totals.platformRevenue)}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Commission earned (yours to keep)
            </p>
          </CardContent>
        </Card>

        {/* Client Funds Held */}
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <Wallet className="h-4 w-4" />
              Client Funds Held
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
              {formatShort(data.totals.clientFundsHeld)}
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              Owed to campaign/group owners
            </p>
          </CardContent>
        </Card>

        {/* Pending Withdrawals */}
        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <Clock className="h-4 w-4" />
              Pending Withdrawals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900 dark:text-red-100">
              {formatShort(data.totals.pendingWithdrawals)}
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Awaiting payout approval
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Breakdown by Source</CardTitle>
          <CardDescription>
            Commission is deducted at payment time. Client balance = Gross - Commission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-semibold">Source</th>
                  <th className="text-right py-3 px-4 font-semibold">Gross Collected</th>
                  <th className="text-right py-3 px-4 font-semibold">Commission (Rate)</th>
                  <th className="text-right py-3 px-4 font-semibold">Client Balance</th>
                  <th className="text-right py-3 px-4 font-semibold">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Mchango */}
                <tr className="hover:bg-muted/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Mchango</p>
                        <p className="text-xs text-muted-foreground">Fundraising campaigns</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 font-mono">
                    {formatCurrency(data.mchango.grossCollected)}
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="font-mono">{formatCurrency(data.mchango.commission)}</div>
                    <Badge variant="secondary" className="text-xs">15%</Badge>
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-green-600 dark:text-green-400">
                    {formatCurrency(data.mchango.clientFunds)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-orange-600 dark:text-orange-400">
                    {formatCurrency(data.mchango.pendingWithdrawals)}
                  </td>
                </tr>

                {/* Chama */}
                <tr className="hover:bg-muted/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-accent/10">
                        <Users className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium">Chama</p>
                        <p className="text-xs text-muted-foreground">Rotating savings</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 font-mono">
                    {formatCurrency(data.chama.grossCollected)}
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="font-mono">{formatCurrency(data.chama.commission)}</div>
                    <Badge variant="secondary" className="text-xs">5%</Badge>
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-green-600 dark:text-green-400">
                    {formatCurrency(data.chama.clientFunds)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-muted-foreground">
                    —
                  </td>
                </tr>

                {/* Organizations */}
                <tr className="hover:bg-muted/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <Building2 className="h-4 w-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="font-medium">Organizations</p>
                        <p className="text-xs text-muted-foreground">NGOs & charities</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 font-mono">
                    {formatCurrency(data.organizations.grossCollected)}
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="font-mono">{formatCurrency(data.organizations.commission)}</div>
                    <Badge variant="secondary" className="text-xs">5%</Badge>
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-green-600 dark:text-green-400">
                    {formatCurrency(data.organizations.clientFunds)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-orange-600 dark:text-orange-400">
                    {formatCurrency(data.organizations.pendingWithdrawals)}
                  </td>
                </tr>

                {/* Totals Row */}
                <tr className="bg-muted/50 font-bold">
                  <td className="py-3 px-4">TOTAL</td>
                  <td className="text-right py-3 px-4 font-mono">
                    {formatCurrency(data.totals.grossCollected)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-green-600 dark:text-green-400">
                    {formatCurrency(data.totals.platformRevenue)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono">
                    {formatCurrency(data.totals.clientFundsHeld)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono text-orange-600 dark:text-orange-400">
                    {formatCurrency(data.totals.pendingWithdrawals)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Gross = Total collected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Commission = Your revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span>Client = Owed to owners</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>Pending = Awaiting payout</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
