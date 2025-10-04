import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, TrendingUp, DollarSign, Activity, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Check admin access
  useEffect(() => {
    checkAdminAccess();
  }, []);

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeCampaigns: 0,
    activeGroups: 0,
    totalFundsRaised: 0,
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin:', error);
        toast.error("Error verifying admin access");
        navigate("/home");
        return;
      }

      if (!data) {
        toast.error("Access denied: Admin privileges required");
        navigate("/home");
        return;
      }

      setIsAdmin(true);
      await fetchAdminData();
    } catch (error) {
      console.error('Admin check error:', error);
      toast.error("Error checking admin access");
      navigate("/home");
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    try {
      // Fetch total users count
      const { count: usersCount, error: usersError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (usersError) throw usersError;

      // Fetch active mchangos
      const { data: mchangos, error: mchangosError } = await supabase
        .from('mchango')
        .select('*')
        .eq('status', 'active');

      if (mchangosError) throw mchangosError;

      // Fetch active chamas
      const { data: chamas, error: chamasError } = await supabase
        .from('chama')
        .select('*')
        .eq('status', 'active');

      if (chamasError) throw chamasError;

      // Calculate total funds raised
      const totalFunds = mchangos?.reduce((sum, m) => sum + Number(m.current_amount || 0), 0) || 0;

      setStats({
        totalUsers: usersCount || 0,
        activeCampaigns: mchangos?.length || 0,
        activeGroups: chamas?.length || 0,
        totalFundsRaised: totalFunds,
      });

      // Fetch recent users
      const { data: recentUsersData, error: recentUsersError } = await supabase
        .from('profiles')
        .select('full_name, email, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentUsersError) throw recentUsersError;

      setRecentUsers(recentUsersData?.map(u => ({
        name: u.full_name,
        email: u.email,
        joined: new Date(u.created_at).toLocaleDateString()
      })) || []);

      // Fetch recent campaigns
      const { data: recentCampaignsData, error: recentCampaignsError } = await supabase
        .from('mchango')
        .select('title, status, current_amount, target_amount')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentCampaignsError) throw recentCampaignsError;

      setRecentCampaigns(recentCampaignsData?.map(c => ({
        title: c.title,
        status: c.status,
        raised: Number(c.current_amount || 0),
        goal: Number(c.target_amount || 0)
      })) || []);

    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      toast.error("Failed to load admin data");
    }
  };

  if (loading) {
    return (
      <Layout showBackButton title="Admin Dashboard">
        <div className="container px-4 py-6 max-w-6xl mx-auto">
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showBackButton title="Admin Dashboard">
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.totalUsers.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Campaigns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.activeCampaigns}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Groups</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {stats.activeGroups}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Funds Raised</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold text-foreground">
                  {(stats.totalFundsRaised / 1000000).toFixed(1)}M
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Views */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => navigate("/admin/kyc")}
            >
              <FileCheck className="mr-2 h-4 w-4" />
              Review KYC Submissions
            </Button>
            <Button variant="outline" className="justify-start">
              <Users className="mr-2 h-4 w-4" />
              Manage Users
            </Button>
            <Button variant="outline" className="justify-start">
              <Activity className="mr-2 h-4 w-4" />
              View Reports
            </Button>
          </CardContent>
        </Card>

        {/* Detailed Views */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Recent Users</CardTitle>
                <CardDescription>Newly registered members</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentUsers.map((user, index) => (
                    <div key={index} className="flex items-center justify-between pb-4 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <span className="text-sm text-muted-foreground">{user.joined}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns">
            <Card>
              <CardHeader>
                <CardTitle>Recent Campaigns</CardTitle>
                <CardDescription>Latest fundraising activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentCampaigns.map((campaign, index) => (
                    <div key={index} className="flex items-center justify-between pb-4 border-b border-border last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-foreground">{campaign.title}</p>
                          <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          KES {campaign.raised.toLocaleString()} / {campaign.goal.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups">
            <Card>
              <CardHeader>
                <CardTitle>Chama Groups</CardTitle>
                <CardDescription>Active savings groups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>Group management features coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
