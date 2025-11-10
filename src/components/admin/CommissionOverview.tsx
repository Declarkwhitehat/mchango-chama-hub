import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, Loader2, PiggyBank, Users, Heart } from "lucide-react";
import { 
  MCHANGO_COMMISSION_RATE, 
  CHAMA_DEFAULT_COMMISSION_RATE,
  formatCommissionPercentage 
} from "@/utils/commissionCalculator";

interface CommissionData {
  mchangoCommission: number;
  mchangoDonations: number;
  chamaCommission: number;
  chamaContributions: number;
  savingsCommission: number;
  savingsDeposits: number;
  totalCommission: number;
}

export const CommissionOverview = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CommissionData>({
    mchangoCommission: 0,
    mchangoDonations: 0,
    chamaCommission: 0,
    chamaContributions: 0,
    savingsCommission: 0,
    savingsDeposits: 0,
    totalCommission: 0,
  });

  useEffect(() => {
    fetchCommissionData();
  }, []);

  const fetchCommissionData = async () => {
    try {
      // Fetch Mchango donations (completed only)
      const { data: donations, error: donationsError } = await supabase
        .from('mchango_donations')
        .select('amount')
        .eq('payment_status', 'completed');

      if (donationsError) throw donationsError;

      const mchangoDonations = donations?.reduce((sum, d) => sum + Number(d.amount), 0) || 0;
      const mchangoCommission = mchangoDonations * MCHANGO_COMMISSION_RATE;

      // Fetch Chama contributions (completed only)
      const { data: contributions, error: contributionsError } = await supabase
        .from('contributions')
        .select('amount')
        .eq('status', 'completed');

      if (contributionsError) throw contributionsError;

      const chamaContributions = contributions?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
      const chamaCommission = chamaContributions * CHAMA_DEFAULT_COMMISSION_RATE;

      // Fetch Savings Group deposits with commission
      const { data: deposits, error: depositsError } = await supabase
        .from('saving_group_deposits')
        .select('net_amount, commission_amount');

      if (depositsError) throw depositsError;

      const savingsDeposits = deposits?.reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;
      const savingsCommission = deposits?.reduce((sum, d) => sum + Number(d.commission_amount), 0) || 0;

      // Calculate totals
      const totalCommission = mchangoCommission + chamaCommission + savingsCommission;

      setData({
        mchangoCommission,
        mchangoDonations,
        chamaCommission,
        chamaContributions,
        savingsCommission,
        savingsDeposits,
        totalCommission,
      });
    } catch (error: any) {
      console.error('Error fetching commission data:', error);
      toast({
        title: "Error",
        description: "Failed to load commission data",
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

  return (
    <div className="space-y-6">
      {/* Total Commission Overview */}
      <Card className="border-2 border-primary bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Total Platform Commission
          </CardTitle>
          <CardDescription>
            Accumulated commission from all revenue streams
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">
            KES {data.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      {/* Breakdown by Source */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Mchango Commission */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink-500" />
              Mchango Commission
            </CardTitle>
            <CardDescription>
              {formatCommissionPercentage(MCHANGO_COMMISSION_RATE)} per donation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Donations</p>
              <p className="text-lg font-semibold">
                KES {data.mchangoDonations.toLocaleString()}
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Commission Earned</p>
              <p className="text-2xl font-bold text-pink-600">
                KES {data.mchangoCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              {formatCommissionPercentage(MCHANGO_COMMISSION_RATE)} Rate
            </Badge>
          </CardContent>
        </Card>

        {/* Chama Commission */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Chama Commission
            </CardTitle>
            <CardDescription>
              {formatCommissionPercentage(CHAMA_DEFAULT_COMMISSION_RATE)} per contribution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Contributions</p>
              <p className="text-lg font-semibold">
                KES {data.chamaContributions.toLocaleString()}
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Commission Earned</p>
              <p className="text-2xl font-bold text-blue-600">
                KES {data.chamaCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              {formatCommissionPercentage(CHAMA_DEFAULT_COMMISSION_RATE)} Rate
            </Badge>
          </CardContent>
        </Card>

        {/* Savings Group Commission */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-green-500" />
              Savings Group Commission
            </CardTitle>
            <CardDescription>
              Variable rate per deposit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Deposits</p>
              <p className="text-lg font-semibold">
                KES {data.savingsDeposits.toLocaleString()}
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Commission Earned</p>
              <p className="text-2xl font-bold text-green-600">
                KES {data.savingsCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              Variable Rate
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Commission Distribution
          </CardTitle>
          <CardDescription>
            Percentage breakdown by revenue source
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Mchango Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Mchango</span>
                <span className="text-muted-foreground">
                  {data.totalCommission > 0 
                    ? ((data.mchangoCommission / data.totalCommission) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-pink-500 transition-all duration-500"
                  style={{ 
                    width: `${data.totalCommission > 0 
                      ? (data.mchangoCommission / data.totalCommission) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>

            {/* Chama Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Chama</span>
                <span className="text-muted-foreground">
                  {data.totalCommission > 0 
                    ? ((data.chamaCommission / data.totalCommission) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ 
                    width: `${data.totalCommission > 0 
                      ? (data.chamaCommission / data.totalCommission) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>

            {/* Savings Group Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Savings Groups</span>
                <span className="text-muted-foreground">
                  {data.totalCommission > 0 
                    ? ((data.savingsCommission / data.totalCommission) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ 
                    width: `${data.totalCommission > 0 
                      ? (data.savingsCommission / data.totalCommission) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};