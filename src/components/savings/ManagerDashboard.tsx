import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  TrendingUp,
  DollarSign,
  PieChart,
  PlayCircle,
  Download,
  Loader2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MemberList from "./MemberList";
import SavingsChart from "./SavingsChart";

interface ManagerDashboardProps {
  group: any;
  onRefresh: () => void;
}

export default function SavingsGroupManagerDashboard({
  group,
  onRefresh,
}: ManagerDashboardProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeLoans: 0,
    totalSavings: 0,
    totalProfits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [startingGroup, setStartingGroup] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [group.id]);

  const fetchDashboardData = async () => {
    try {
      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from("saving_group_members")
        .select(
          `
          *,
          profiles:user_id (
            full_name,
            phone,
            email
          )
        `
        )
        .eq("group_id", group.id);

      if (membersError) throw membersError;
      setMembers(membersData || []);

      // Fetch loans
      const { count: loansCount } = await supabase
        .from("saving_group_loans")
        .select("*", { count: "exact", head: true })
        .eq("saving_group_id", group.id)
        .eq("is_active", true);

      setStats({
        totalMembers: membersData?.length || 0,
        activeLoans: loansCount || 0,
        totalSavings: group.total_savings || 0,
        totalProfits: group.total_profits || 0,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartGroup = async () => {
    setStartingGroup(true);
    try {
      // Call edge function to start group and send SMS
      const { data, error } = await supabase.functions.invoke(
        "savings-group-start",
        {
          body: { groupId: group.id },
        }
      );

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Group started and members notified via SMS",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setStartingGroup(false);
    }
  };

  const handleExportReport = () => {
    toast({
      title: "Export",
      description: "Generating report...",
    });
    // TODO: Implement export functionality
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">{group.name}</h1>
          <p className="text-muted-foreground">Manager Dashboard</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.status === "pending" && (
            <Button
              onClick={handleStartGroup}
              disabled={startingGroup || stats.totalMembers < 5}
            >
              {startingGroup ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Start Group
            </Button>
          )}
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Members</p>
              <p className="text-2xl font-bold">{stats.totalMembers}</p>
            </div>
            <Users className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
              <p className="text-2xl font-bold">
                KES {stats.totalSavings.toLocaleString()}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Profits</p>
              <p className="text-2xl font-bold">
                KES {stats.totalProfits.toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Active Loans</p>
              <p className="text-2xl font-bold">{stats.activeLoans}</p>
            </div>
            <PieChart className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <MemberList
            members={members}
            groupId={group.id}
            onRefresh={fetchDashboardData}
          />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <SavingsChart groupId={group.id} />
        </TabsContent>

        <TabsContent value="loans" className="mt-6">
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Loan Management</h3>
            <p className="text-muted-foreground">
              Loan management interface coming soon
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
