import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { TrendingUp, Users, Plus, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Mchango {
  id: string;
  title: string;
  slug: string;
  description: string;
  target_amount: number;
  current_amount: number;
  end_date: string;
  created_at: string;
}

interface Chama {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  contribution_amount: number;
  contribution_frequency: string;
}

const Home = () => {
  const [activeTab, setActiveTab] = useState("mchango");
  const [mchangoList, setMchangoList] = useState<Mchango[]>([]);
  const [chamaList, setChamaList] = useState<Chama[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  // Refresh dashboard lists when a new Chama/Mchango is created
  useEffect(() => {
    const onCreated = () => { fetchUserData(); };
    window.addEventListener('mchango:created', onCreated);
    window.addEventListener('chama:created', onCreated);
    return () => {
      window.removeEventListener('mchango:created', onCreated);
      window.removeEventListener('chama:created', onCreated);
    };
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);

      // Fetch user's mchangos
      const { data: mchangos, error: mchangoError } = await supabase
        .from('mchango')
        .select('*')
        .eq('created_by', user?.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (mchangoError) throw mchangoError;
      setMchangoList(mchangos || []);

      // Fetch user's chamas
      const { data: chamas, error: chamaError } = await supabase
        .from('chama')
        .select('*')
        .eq('created_by', user?.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (chamaError) throw chamaError;
      setChamaList(chamas || []);
    } catch (error: any) {
      console.error('Error fetching user data:', error);
      toast.error("Failed to load your data");
    } finally {
      setLoading(false);
    }
  };

  const getDaysLeft = (endDate: string) => {
    if (!endDate) return null;
    const now = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  return (
    <Layout>
      <div className="container px-4 py-6 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Manage your financial journey</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="mchango" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Mchango
            </TabsTrigger>
            <TabsTrigger value="chama" className="gap-2">
              <Users className="h-4 w-4" />
              Chama
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mchango" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-foreground">My Campaigns</h2>
              <Link to="/mchango/create">
                <Button variant="hero" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              </Link>
            </div>

            {loading ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Loading campaigns...</p>
                </CardContent>
              </Card>
            ) : mchangoList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center space-y-4">
                  <p className="text-muted-foreground">You haven't created any campaigns yet</p>
                  <Link to="/mchango/create">
                    <Button variant="hero">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Campaign
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {mchangoList.map((campaign) => {
                  const progress = (Number(campaign.current_amount) / Number(campaign.target_amount)) * 100;
                  const daysLeft = getDaysLeft(campaign.end_date);

                  return (
                    <Link key={campaign.id} to={`/mchango/${campaign.slug}`}>
                      <Card className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{campaign.title}</CardTitle>
                              <CardDescription>{campaign.description}</CardDescription>
                            </div>
                            {daysLeft !== null && (
                              <Badge variant="secondary">{daysLeft} days</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              KES {Number(campaign.current_amount).toLocaleString()} raised
                            </span>
                            <span className="font-semibold text-foreground">
                              of KES {Number(campaign.target_amount).toLocaleString()}
                            </span>
                          </div>
                          <Progress value={progress} />
                          <div className="text-sm text-muted-foreground">
                            {progress.toFixed(1)}% funded
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="chama" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-foreground">My Groups</h2>
              <Link to="/chama/create">
                <Button variant="heroSecondary" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              </Link>
            </div>

            {loading ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Loading groups...</p>
                </CardContent>
              </Card>
            ) : chamaList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center space-y-4">
                  <p className="text-muted-foreground">You haven't created any chama groups yet</p>
                  <Link to="/chama/create">
                    <Button variant="heroSecondary">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Group
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {chamaList.map((group) => (
                  <Link key={group.id} to={`/chama/${group.slug}`}>
                    <Card className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{group.name}</CardTitle>
                        <CardDescription>{group.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Contribution</p>
                            <p className="text-xl font-bold text-foreground">
                              KES {Number(group.contribution_amount).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Frequency</p>
                            <p className="text-lg font-semibold text-foreground capitalize">
                              {group.contribution_frequency.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t border-border">
                          <Calendar className="h-4 w-4" />
                          Created: {new Date(group.created_at).toLocaleDateString()}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Home;
