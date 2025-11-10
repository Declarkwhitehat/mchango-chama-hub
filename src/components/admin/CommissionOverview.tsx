import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, Loader2, PiggyBank, Users, Heart, Percent, ArrowUpRight, ArrowDownRight, Calendar, BarChart3 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
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

interface TrendData {
  date: string;
  mchango: number;
  chama: number;
  savings: number;
  total: number;
}

interface GrowthData {
  current: number;
  previous: number;
  percentage: number;
  isPositive: boolean;
}

export const CommissionOverview = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [data, setData] = useState<CommissionData>({
    mchangoCommission: 0,
    mchangoDonations: 0,
    chamaCommission: 0,
    chamaContributions: 0,
    savingsCommission: 0,
    savingsDeposits: 0,
    totalCommission: 0,
  });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [growthData, setGrowthData] = useState<GrowthData>({
    current: 0,
    previous: 0,
    percentage: 0,
    isPositive: true,
  });

  useEffect(() => {
    fetchCommissionData();
    fetchTrendData();
  }, [period]);

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

  const fetchTrendData = async () => {
    try {
      let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;
      let dataPoints: TrendData[] = [];

      const now = new Date();

      if (period === 'daily') {
        // Last 7 days
        currentStart = startOfDay(subDays(now, 6));
        currentEnd = endOfDay(now);
        previousStart = startOfDay(subDays(now, 13));
        previousEnd = endOfDay(subDays(now, 7));

        for (let i = 6; i >= 0; i--) {
          const date = subDays(now, i);
          const dayStart = startOfDay(date);
          const dayEnd = endOfDay(date);

          const [mchangoData, chamaData, savingsData] = await Promise.all([
            supabase.from('mchango_donations').select('amount').eq('payment_status', 'completed')
              .gte('completed_at', dayStart.toISOString()).lte('completed_at', dayEnd.toISOString()),
            supabase.from('contributions').select('amount').eq('status', 'completed')
              .gte('contribution_date', dayStart.toISOString()).lte('contribution_date', dayEnd.toISOString()),
            supabase.from('saving_group_deposits').select('commission_amount')
              .gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()),
          ]);

          const mchango = (mchangoData.data?.reduce((sum, d) => sum + Number(d.amount), 0) || 0) * MCHANGO_COMMISSION_RATE;
          const chama = (chamaData.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0) * CHAMA_DEFAULT_COMMISSION_RATE;
          const savings = savingsData.data?.reduce((sum, d) => sum + Number(d.commission_amount), 0) || 0;

          dataPoints.push({
            date: format(date, 'MMM dd'),
            mchango,
            chama,
            savings,
            total: mchango + chama + savings,
          });
        }
      } else if (period === 'weekly') {
        // Last 8 weeks
        for (let i = 7; i >= 0; i--) {
          const weekStart = startOfWeek(subWeeks(now, i));
          const weekEnd = endOfWeek(subWeeks(now, i));

          const [mchangoData, chamaData, savingsData] = await Promise.all([
            supabase.from('mchango_donations').select('amount').eq('payment_status', 'completed')
              .gte('completed_at', weekStart.toISOString()).lte('completed_at', weekEnd.toISOString()),
            supabase.from('contributions').select('amount').eq('status', 'completed')
              .gte('contribution_date', weekStart.toISOString()).lte('contribution_date', weekEnd.toISOString()),
            supabase.from('saving_group_deposits').select('commission_amount')
              .gte('created_at', weekStart.toISOString()).lte('created_at', weekEnd.toISOString()),
          ]);

          const mchango = (mchangoData.data?.reduce((sum, d) => sum + Number(d.amount), 0) || 0) * MCHANGO_COMMISSION_RATE;
          const chama = (chamaData.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0) * CHAMA_DEFAULT_COMMISSION_RATE;
          const savings = savingsData.data?.reduce((sum, d) => sum + Number(d.commission_amount), 0) || 0;

          dataPoints.push({
            date: format(weekStart, 'MMM dd'),
            mchango,
            chama,
            savings,
            total: mchango + chama + savings,
          });
        }

        currentStart = startOfWeek(now);
        currentEnd = endOfWeek(now);
        previousStart = startOfWeek(subWeeks(now, 1));
        previousEnd = endOfWeek(subWeeks(now, 1));
      } else {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
          const monthStart = startOfMonth(subMonths(now, i));
          const monthEnd = endOfMonth(subMonths(now, i));

          const [mchangoData, chamaData, savingsData] = await Promise.all([
            supabase.from('mchango_donations').select('amount').eq('payment_status', 'completed')
              .gte('completed_at', monthStart.toISOString()).lte('completed_at', monthEnd.toISOString()),
            supabase.from('contributions').select('amount').eq('status', 'completed')
              .gte('contribution_date', monthStart.toISOString()).lte('contribution_date', monthEnd.toISOString()),
            supabase.from('saving_group_deposits').select('commission_amount')
              .gte('created_at', monthStart.toISOString()).lte('created_at', monthEnd.toISOString()),
          ]);

          const mchango = (mchangoData.data?.reduce((sum, d) => sum + Number(d.amount), 0) || 0) * MCHANGO_COMMISSION_RATE;
          const chama = (chamaData.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0) * CHAMA_DEFAULT_COMMISSION_RATE;
          const savings = savingsData.data?.reduce((sum, d) => sum + Number(d.commission_amount), 0) || 0;

          dataPoints.push({
            date: format(monthStart, 'MMM yyyy'),
            mchango,
            chama,
            savings,
            total: mchango + chama + savings,
          });
        }

        currentStart = startOfMonth(now);
        currentEnd = endOfMonth(now);
        previousStart = startOfMonth(subMonths(now, 1));
        previousEnd = endOfMonth(subMonths(now, 1));
      }

      setTrendData(dataPoints);

      // Calculate growth
      const [currentMchango, currentChama, currentSavings] = await Promise.all([
        supabase.from('mchango_donations').select('amount').eq('payment_status', 'completed')
          .gte('completed_at', currentStart.toISOString()).lte('completed_at', currentEnd.toISOString()),
        supabase.from('contributions').select('amount').eq('status', 'completed')
          .gte('contribution_date', currentStart.toISOString()).lte('contribution_date', currentEnd.toISOString()),
        supabase.from('saving_group_deposits').select('commission_amount')
          .gte('created_at', currentStart.toISOString()).lte('created_at', currentEnd.toISOString()),
      ]);

      const [previousMchango, previousChama, previousSavings] = await Promise.all([
        supabase.from('mchango_donations').select('amount').eq('payment_status', 'completed')
          .gte('completed_at', previousStart.toISOString()).lte('completed_at', previousEnd.toISOString()),
        supabase.from('contributions').select('amount').eq('status', 'completed')
          .gte('contribution_date', previousStart.toISOString()).lte('contribution_date', previousEnd.toISOString()),
        supabase.from('saving_group_deposits').select('commission_amount')
          .gte('created_at', previousStart.toISOString()).lte('created_at', previousEnd.toISOString()),
      ]);

      const currentTotal = 
        (currentMchango.data?.reduce((sum, d) => sum + Number(d.amount), 0) || 0) * MCHANGO_COMMISSION_RATE +
        (currentChama.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0) * CHAMA_DEFAULT_COMMISSION_RATE +
        (currentSavings.data?.reduce((sum, d) => sum + Number(d.commission_amount), 0) || 0);

      const previousTotal = 
        (previousMchango.data?.reduce((sum, d) => sum + Number(d.amount), 0) || 0) * MCHANGO_COMMISSION_RATE +
        (previousChama.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0) * CHAMA_DEFAULT_COMMISSION_RATE +
        (previousSavings.data?.reduce((sum, d) => sum + Number(d.commission_amount), 0) || 0);

      const growthPercentage = previousTotal > 0 
        ? ((currentTotal - previousTotal) / previousTotal) * 100 
        : currentTotal > 0 ? 100 : 0;

      setGrowthData({
        current: currentTotal,
        previous: previousTotal,
        percentage: Math.abs(growthPercentage),
        isPositive: growthPercentage >= 0,
      });

    } catch (error: any) {
      console.error('Error fetching trend data:', error);
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
      {/* Hero Commission Card with Growth */}
      <Card className="relative overflow-hidden border-2 border-primary">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-32 translate-x-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full translate-y-24 -translate-x-24" />
        
        <CardContent className="relative pt-8 pb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Platform Revenue (All Time)
              </p>
              <h2 className="text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                KES {data.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <div className="flex items-center gap-3 mt-3">
                <Badge 
                  variant={growthData.isPositive ? "default" : "destructive"} 
                  className="text-base px-3 py-1"
                >
                  {growthData.isPositive ? (
                    <ArrowUpRight className="h-4 w-4 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 mr-1" />
                  )}
                  {growthData.percentage.toFixed(1)}%
                </Badge>
                <span className="text-sm text-muted-foreground">
                  vs previous {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">Current {period === 'daily' ? 'Day' : period === 'weekly' ? 'Week' : 'Month'}</p>
              <p className="text-2xl font-bold">
                KES {growthData.current.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Previous: KES {growthData.previous.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t">
            <div className="text-center">
              <p className="text-2xl font-bold text-pink-600">
                {formatCommissionPercentage(MCHANGO_COMMISSION_RATE)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Mchango Rate</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {formatCommissionPercentage(CHAMA_DEFAULT_COMMISSION_RATE)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Chama Rate</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                Variable
              </p>
              <p className="text-xs text-muted-foreground mt-1">Savings Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Trends Analytics */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Revenue Trends & Analytics
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Track commission performance over time
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={period === 'daily' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('daily')}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Daily
              </Button>
              <Button
                variant={period === 'weekly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('weekly')}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Weekly
              </Button>
              <Button
                variant={period === 'monthly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('monthly')}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Monthly
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="area" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="area">Area Chart</TabsTrigger>
              <TabsTrigger value="line">Line Chart</TabsTrigger>
              <TabsTrigger value="bar">Bar Chart</TabsTrigger>
            </TabsList>

            <TabsContent value="area">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorMchango" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorChama" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="mchango" 
                    stroke="#ec4899" 
                    fillOpacity={1} 
                    fill="url(#colorMchango)" 
                    name="Mchango"
                    stackId="1"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="chama" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorChama)" 
                    name="Chama"
                    stackId="1"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="savings" 
                    stroke="#22c55e" 
                    fillOpacity={1} 
                    fill="url(#colorSavings)" 
                    name="Savings"
                    stackId="1"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="line">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="total" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    name="Total Revenue"
                    dot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="mchango" 
                    stroke="#ec4899" 
                    strokeWidth={2}
                    name="Mchango"
                    dot={{ r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="chama" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Chama"
                    dot={{ r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="savings" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    name="Savings"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="bar">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                  <Legend />
                  <Bar dataKey="mchango" fill="#ec4899" name="Mchango" stackId="a" />
                  <Bar dataKey="chama" fill="#3b82f6" name="Chama" stackId="a" />
                  <Bar dataKey="savings" fill="#22c55e" name="Savings" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>

          {/* Period Summary */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
            <div className="text-center p-4 bg-pink-50 dark:bg-pink-950/20 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Mchango (Period Avg)</p>
              <p className="text-2xl font-bold text-pink-600">
                KES {(trendData.reduce((sum, d) => sum + d.mchango, 0) / (trendData.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Chama (Period Avg)</p>
              <p className="text-2xl font-bold text-blue-600">
                KES {(trendData.reduce((sum, d) => sum + d.chama, 0) / (trendData.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Savings (Period Avg)</p>
              <p className="text-2xl font-bold text-green-600">
                KES {(trendData.reduce((sum, d) => sum + d.savings, 0) / (trendData.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown by Source - Enhanced Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Mchango Commission */}
        <Card className="relative overflow-hidden border-2 border-pink-200 bg-gradient-to-br from-pink-50 to-white dark:from-pink-950/20 dark:to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full -translate-y-16 translate-x-16" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-full bg-pink-500/10 flex items-center justify-center">
                <Heart className="h-6 w-6 text-pink-500" />
              </div>
              <Badge variant="secondary" className="bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                <Percent className="h-3 w-3 mr-1" />
                {formatCommissionPercentage(MCHANGO_COMMISSION_RATE)}
              </Badge>
            </div>
            <CardTitle className="text-lg mt-3">Mchango (Campaigns)</CardTitle>
            <CardDescription>
              {formatCommissionPercentage(MCHANGO_COMMISSION_RATE)} commission per donation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 relative">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Total Donations Received</p>
              <p className="text-xl font-bold">
                KES {data.mchangoDonations.toLocaleString()}
              </p>
            </div>
            <div className="pt-3 border-t border-pink-200">
              <p className="text-xs font-medium text-muted-foreground mb-2">Your Commission</p>
              <p className="text-3xl font-bold text-pink-600">
                KES {data.mchangoCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Share of Total</span>
                <span className="font-medium">
                  {data.totalCommission > 0 
                    ? ((data.mchangoCommission / data.totalCommission) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="h-2 bg-pink-100 dark:bg-pink-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-pink-400 to-pink-600 transition-all duration-500"
                  style={{ 
                    width: `${data.totalCommission > 0 
                      ? (data.mchangoCommission / data.totalCommission) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chama Commission */}
        <Card className="relative overflow-hidden border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-16 translate-x-16" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <Percent className="h-3 w-3 mr-1" />
                {formatCommissionPercentage(CHAMA_DEFAULT_COMMISSION_RATE)}
              </Badge>
            </div>
            <CardTitle className="text-lg mt-3">Chama (Groups)</CardTitle>
            <CardDescription>
              {formatCommissionPercentage(CHAMA_DEFAULT_COMMISSION_RATE)} commission per contribution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 relative">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Total Contributions Made</p>
              <p className="text-xl font-bold">
                KES {data.chamaContributions.toLocaleString()}
              </p>
            </div>
            <div className="pt-3 border-t border-blue-200">
              <p className="text-xs font-medium text-muted-foreground mb-2">Your Commission</p>
              <p className="text-3xl font-bold text-blue-600">
                KES {data.chamaCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Share of Total</span>
                <span className="font-medium">
                  {data.totalCommission > 0 
                    ? ((data.chamaCommission / data.totalCommission) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="h-2 bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                  style={{ 
                    width: `${data.totalCommission > 0 
                      ? (data.chamaCommission / data.totalCommission) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Savings Group Commission */}
        <Card className="relative overflow-hidden border-2 border-green-200 bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-background">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full -translate-y-16 translate-x-16" />
          <CardHeader className="pb-3 relative">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <PiggyBank className="h-6 w-6 text-green-500" />
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                <Percent className="h-3 w-3 mr-1" />
                Variable
              </Badge>
            </div>
            <CardTitle className="text-lg mt-3">Savings Groups</CardTitle>
            <CardDescription>
              Variable commission rate per deposit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 relative">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Total Deposits Made</p>
              <p className="text-xl font-bold">
                KES {data.savingsDeposits.toLocaleString()}
              </p>
            </div>
            <div className="pt-3 border-t border-green-200">
              <p className="text-xs font-medium text-muted-foreground mb-2">Your Commission</p>
              <p className="text-3xl font-bold text-green-600">
                KES {data.savingsCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Share of Total</span>
                <span className="font-medium">
                  {data.totalCommission > 0 
                    ? ((data.savingsCommission / data.totalCommission) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="h-2 bg-green-100 dark:bg-green-900/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                  style={{ 
                    width: `${data.totalCommission > 0 
                      ? (data.savingsCommission / data.totalCommission) * 100 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown Table */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <DollarSign className="h-5 w-5 text-primary" />
            Detailed Commission Breakdown
          </CardTitle>
          <CardDescription>
            Complete overview of all revenue streams and commission rates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Revenue Source</th>
                  <th className="text-right py-3 px-4 font-semibold">Rate</th>
                  <th className="text-right py-3 px-4 font-semibold">Transaction Volume</th>
                  <th className="text-right py-3 px-4 font-semibold">Commission (KSH)</th>
                  <th className="text-right py-3 px-4 font-semibold">% of Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-pink-50/50 dark:hover:bg-pink-950/20">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                        <Heart className="h-4 w-4 text-pink-500" />
                      </div>
                      <span className="font-medium">Mchango Donations</span>
                    </div>
                  </td>
                  <td className="text-right py-4 px-4">
                    <Badge variant="secondary" className="bg-pink-100 text-pink-700 dark:bg-pink-900/30">
                      {formatCommissionPercentage(MCHANGO_COMMISSION_RATE)}
                    </Badge>
                  </td>
                  <td className="text-right py-4 px-4 font-medium">
                    KES {data.mchangoDonations.toLocaleString()}
                  </td>
                  <td className="text-right py-4 px-4 font-bold text-pink-600">
                    KES {data.mchangoCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-4 px-4 font-semibold">
                    {data.totalCommission > 0 
                      ? ((data.mchangoCommission / data.totalCommission) * 100).toFixed(1)
                      : 0}%
                  </td>
                </tr>
                <tr className="border-b hover:bg-blue-50/50 dark:hover:bg-blue-950/20">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Users className="h-4 w-4 text-blue-500" />
                      </div>
                      <span className="font-medium">Chama Contributions</span>
                    </div>
                  </td>
                  <td className="text-right py-4 px-4">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30">
                      {formatCommissionPercentage(CHAMA_DEFAULT_COMMISSION_RATE)}
                    </Badge>
                  </td>
                  <td className="text-right py-4 px-4 font-medium">
                    KES {data.chamaContributions.toLocaleString()}
                  </td>
                  <td className="text-right py-4 px-4 font-bold text-blue-600">
                    KES {data.chamaCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-4 px-4 font-semibold">
                    {data.totalCommission > 0 
                      ? ((data.chamaCommission / data.totalCommission) * 100).toFixed(1)
                      : 0}%
                  </td>
                </tr>
                <tr className="border-b hover:bg-green-50/50 dark:hover:bg-green-950/20">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <PiggyBank className="h-4 w-4 text-green-500" />
                      </div>
                      <span className="font-medium">Savings Deposits</span>
                    </div>
                  </td>
                  <td className="text-right py-4 px-4">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30">
                      Variable
                    </Badge>
                  </td>
                  <td className="text-right py-4 px-4 font-medium">
                    KES {data.savingsDeposits.toLocaleString()}
                  </td>
                  <td className="text-right py-4 px-4 font-bold text-green-600">
                    KES {data.savingsCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-4 px-4 font-semibold">
                    {data.totalCommission > 0 
                      ? ((data.savingsCommission / data.totalCommission) * 100).toFixed(1)
                      : 0}%
                  </td>
                </tr>
                <tr className="bg-muted/50 font-bold">
                  <td className="py-4 px-4" colSpan={3}>
                    <span className="text-lg">TOTAL PLATFORM COMMISSION</span>
                  </td>
                  <td className="text-right py-4 px-4 text-xl text-primary">
                    KES {data.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-4 px-4 text-lg">
                    100%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};