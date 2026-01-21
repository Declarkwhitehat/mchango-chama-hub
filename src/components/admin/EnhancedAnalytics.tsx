import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { TrendingUp, TrendingDown, Users, DollarSign, Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface AnalyticsData {
  revenueByDay: Array<{ date: string; revenue: number; transactions: number }>;
  userGrowth: Array<{ date: string; newUsers: number; totalUsers: number }>;
  paymentStats: {
    successful: number;
    failed: number;
    pending: number;
    total: number;
  };
  topGroups: Array<{ name: string; revenue: number; type: string }>;
  revenueBySource: Array<{ source: string; amount: number; percentage: number }>;
}

const COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  accent: "hsl(var(--accent))",
  destructive: "hsl(var(--destructive))",
  muted: "hsl(var(--muted-foreground))",
  success: "hsl(142 71% 45%)",
};

export const EnhancedAnalytics = () => {
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const days = parseInt(period);
      const startDate = startOfDay(subDays(new Date(), days));
      const endDate = endOfDay(new Date());

      // Fetch revenue by day with transactions
      const { data: earnings } = await supabase
        .from("company_earnings")
        .select("amount, created_at, source")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: true });

      // Fetch user growth
      const { data: profiles } = await supabase
        .from("profiles")
        .select("created_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: true });

      // Fetch payment statistics
      const { data: transactions } = await supabase
        .from("transactions")
        .select("status, amount")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      // Process revenue by day
      const revenueMap = new Map<string, { revenue: number; transactions: number }>();
      earnings?.forEach((earning) => {
        const date = format(new Date(earning.created_at), "MMM dd");
        const existing = revenueMap.get(date) || { revenue: 0, transactions: 0 };
        revenueMap.set(date, {
          revenue: existing.revenue + Number(earning.amount),
          transactions: existing.transactions + 1,
        });
      });

      const revenueByDay = Array.from(revenueMap.entries()).map(([date, values]) => ({
        date,
        revenue: values.revenue,
        transactions: values.transactions,
      }));

      // Process user growth
      const userMap = new Map<string, number>();
      let cumulativeUsers = 0;
      profiles?.forEach((profile) => {
        const date = format(new Date(profile.created_at), "MMM dd");
        userMap.set(date, (userMap.get(date) || 0) + 1);
      });

      const userGrowth = Array.from(userMap.entries()).map(([date, newUsers]) => {
        cumulativeUsers += newUsers;
        return { date, newUsers, totalUsers: cumulativeUsers };
      });

      // Process payment statistics
      const paymentStats = {
        successful: transactions?.filter((t) => t.status === "completed").length || 0,
        failed: transactions?.filter((t) => t.status === "failed").length || 0,
        pending: transactions?.filter((t) => t.status === "pending").length || 0,
        total: transactions?.length || 0,
      };

      // Revenue by source
      const sourceMap = new Map<string, number>();
      const totalRevenue = earnings?.reduce((sum, e) => sum + Number(e.amount), 0) || 1;
      
      earnings?.forEach((earning) => {
        const source = earning.source || "Other";
        sourceMap.set(source, (sourceMap.get(source) || 0) + Number(earning.amount));
      });

      const revenueBySource = Array.from(sourceMap.entries()).map(([source, amount]) => ({
        source: source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        amount,
        percentage: (amount / totalRevenue) * 100,
      }));

      // Fetch top performing groups
      const [chamaData, savingsData, mchangoData] = await Promise.all([
        supabase
          .from("chama")
          .select("id, name")
          .eq("status", "active")
          .limit(10),
        supabase
          .from("organizations")
          .select("id, name, current_amount")
          .eq("status", "active")
          .order("current_amount", { ascending: false })
          .limit(5),
        supabase
          .from("mchango")
          .select("id, title, current_amount")
          .eq("status", "active")
          .order("current_amount", { ascending: false })
          .limit(5),
      ]);

      const topGroups = [
        ...(mchangoData.data?.map((m) => ({
          name: m.title,
          revenue: m.current_amount || 0,
          type: "Campaign",
        })) || []),
      ]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setData({
        revenueByDay,
        userGrowth,
        paymentStats,
        topGroups,
        revenueBySource,
      });
    } catch (error: any) {
      console.error("Error fetching analytics:", error);
      toast({
        title: "Error",
        description: "Failed to load analytics data",
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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const successRate = data.paymentStats.total > 0
    ? ((data.paymentStats.successful / data.paymentStats.total) * 100).toFixed(1)
    : "0";

  const totalRevenue = data.revenueByDay.reduce((sum, item) => sum + item.revenue, 0);
  const avgDailyRevenue = totalRevenue / parseInt(period);

  return (
    <div className="space-y-6">
      {/* Header with Period Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics Overview</h2>
          <p className="text-muted-foreground">Detailed insights into platform performance</p>
        </div>
        <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <CardDescription>Total Revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">KES {(totalRevenue / 1000).toFixed(1)}K</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg: {(avgDailyRevenue).toFixed(0)}/day
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-accent">
          <CardHeader className="pb-3">
            <CardDescription>Payment Success Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{successRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.paymentStats.successful} of {data.paymentStats.total}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-accent opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-secondary">
          <CardHeader className="pb-3">
            <CardDescription>New Users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {data.userGrowth.reduce((sum, item) => sum + item.newUsers, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(data.userGrowth.reduce((sum, item) => sum + item.newUsers, 0) / parseInt(period)).toFixed(1)}/day
                </p>
              </div>
              <Users className="h-8 w-8 text-secondary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="pb-3">
            <CardDescription>Failed Payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{data.paymentStats.failed}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((data.paymentStats.failed / (data.paymentStats.total || 1)) * 100).toFixed(1)}% failure rate
                </p>
              </div>
              <XCircle className="h-8 w-8 text-destructive opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trends</CardTitle>
          <CardDescription>Daily revenue and transaction volume over time</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="area" className="space-y-4">
            <TabsList>
              <TabsTrigger value="area">Area Chart</TabsTrigger>
              <TabsTrigger value="bar">Bar Chart</TabsTrigger>
              <TabsTrigger value="line">Line Chart</TabsTrigger>
            </TabsList>

            <TabsContent value="area" className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueByDay}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={COLORS.primary}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="bar" className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Bar dataKey="revenue" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="line" className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: COLORS.primary, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
            <CardDescription>New user signups over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.userGrowth}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="newUsers"
                  stroke={COLORS.secondary}
                  fillOpacity={1}
                  fill="url(#colorUsers)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue by Source */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Source</CardTitle>
            <CardDescription>Distribution of revenue across platform features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.revenueBySource.map((item, index) => (
                <div key={item.source} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.source}</span>
                    <span className="text-muted-foreground">
                      KES {(item.amount / 1000).toFixed(1)}K ({item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: [
                          COLORS.primary,
                          COLORS.secondary,
                          COLORS.accent,
                          COLORS.success,
                          COLORS.muted,
                        ][index % 5],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Groups */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Groups</CardTitle>
          <CardDescription>Highest revenue generating campaigns and organizations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.topGroups.map((group, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">KES {(group.revenue / 1000).toFixed(1)}K</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
