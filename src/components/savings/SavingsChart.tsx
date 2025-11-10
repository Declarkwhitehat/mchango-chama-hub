import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface SavingsChartProps {
  groupId: string;
}

export default function SavingsChart({ groupId }: SavingsChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, [groupId]);

  const fetchChartData = async () => {
    try {
      // Fetch deposits over time
      const { data: deposits } = await supabase
        .from("saving_group_deposits")
        .select("created_at, net_amount")
        .eq("saving_group_id", groupId)
        .order("created_at", { ascending: true });

      // Aggregate by month
      const monthlyData: { [key: string]: number } = {};
      deposits?.forEach((deposit) => {
        const month = new Date(deposit.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
        });
        monthlyData[month] = (monthlyData[month] || 0) + deposit.net_amount;
      });

      const formattedData = Object.entries(monthlyData).map(
        ([month, amount]) => ({
          month,
          savings: amount,
        })
      );

      setChartData(formattedData);
    } catch (error) {
      console.error("Error fetching chart data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-64 flex items-center justify-center">
          <p className="text-muted-foreground">Loading chart...</p>
        </div>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Savings Over Time</h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-muted-foreground">No data available yet</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Monthly Savings Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value: number) => `KES ${value.toLocaleString()}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="savings"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              name="Savings"
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Monthly Comparison</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value: number) => `KES ${value.toLocaleString()}`}
            />
            <Legend />
            <Bar dataKey="savings" fill="hsl(var(--primary))" name="Savings" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
