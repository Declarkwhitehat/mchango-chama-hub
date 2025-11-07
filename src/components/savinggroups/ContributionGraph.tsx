import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ContributionGraphProps {
  memberId: string;
  groupId: string;
}

interface MonthlyData {
  month: string;
  amount: number;
}

export default function ContributionGraph({ memberId, groupId }: ContributionGraphProps) {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContributionData();
  }, [memberId, groupId]);

  const loadContributionData = async () => {
    try {
      const currentDate = new Date();
      const twelveMonthsAgo = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 11,
        1
      );

      const { data: deposits, error } = await supabase
        .from("saving_deposits")
        .select("net_amount, deposit_date")
        .eq("member_id", memberId)
        .eq("group_id", groupId)
        .gte("deposit_date", twelveMonthsAgo.toISOString());

      if (error) throw error;

      // Group by month
      const monthlyMap: { [key: string]: number } = {};
      
      // Initialize last 12 months with 0
      for (let i = 11; i >= 0; i--) {
        const date = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - i,
          1
        );
        const key = date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
        monthlyMap[key] = 0;
      }

      // Populate with actual data
      deposits?.forEach((deposit) => {
        const date = new Date(deposit.deposit_date);
        const key = date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
        monthlyMap[key] = (monthlyMap[key] || 0) + Number(deposit.net_amount);
      });

      const chartData = Object.entries(monthlyMap).map(([month, amount]) => ({
        month,
        amount,
      }));

      setData(chartData);
    } catch (error: any) {
      console.error("Error loading contribution data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contribution Graph (Last 12 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip
              formatter={(value: number) =>
                `KSh ${value.toLocaleString("en-KE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              }
            />
            <Bar dataKey="amount" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
