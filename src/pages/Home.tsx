import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Link, useNavigate } from "react-router-dom";
import { TrendingUp, Users, Plus, Calendar, CheckCircle, AlertCircle, Clock, User as UserIcon, Mail, Phone, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  const [memberChamaList, setMemberChamaList] = useState<Chama[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error("Failed to log out");
      return;
    }
    toast.success("Logged out successfully");
    navigate("/");
  };

  const getKYCStatusBadge = () => {
    if (!profile?.kyc_submitted_at) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Not Verified
        </Badge>
      );
    }

    switch (profile.kyc_status) {
      case 'approved':
        return (
          <Badge className="bg-green-500 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Verified
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
    }
  };

  const fetchUserData = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);

      // Fetch user's mchangos
      const { data: mchangos, error: mchangoError } = await supabase
        .from('mchango')
        .select('*')
        .eq('created_by', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (mchangoError) throw mchangoError;
      setMchangoList(mchangos || []);

      // Fetch user's chamas (created by user)
      const { data: chamas, error: chamaError } = await supabase
        .from('chama')
        .select('*')
        .eq('created_by', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (chamaError) throw chamaError;
      setChamaList(chamas || []);

      // Fetch chamas where user is a member
      const { data: memberChamas, error: memberChamaError } = await supabase
        .from('chama_members')
        .select(`
          chama:chama_id (
            id,
            name,
            slug,
            description,
            created_at,
            contribution_amount,
            contribution_frequency
          )
        `)
        .eq('user_id', user.id)
        .eq('approval_status', 'approved');

      if (memberChamaError) throw memberChamaError;
      
      // Filter out nulls and extract chama data
      const memberChamasData = memberChamas
        ?.map(m => m.chama)
        .filter(c => c !== null) as Chama[] || [];
      
      setMemberChamaList(memberChamasData);
    } catch (error: any) {
      console.error('Error fetching user data:', error);
      toast.error("Failed to load your data");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user, fetchUserData]);

  // Refresh dashboard lists when a new Chama/Mchango is created
  useEffect(() => {
    const onCreated = () => { fetchUserData(); };
    window.addEventListener('mchango:created', onCreated);
    window.addEventListener('chama:created', onCreated);
    return () => {
      window.removeEventListener('mchango:created', onCreated);
      window.removeEventListener('chama:created', onCreated);
    };
  }, [fetchUserData]);

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
      <div className="container px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 pb-20 sm:pb-24 max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1 sm:mb-2">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your financial journey</p>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Profile Summary Card */}
          {profile && (
            <Card>
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <Avatar className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0">
                      <AvatarFallback className="text-base sm:text-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                        {profile.full_name.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{profile.full_name}</h2>
                      <div className="flex flex-col gap-0.5 sm:gap-1 mt-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{profile.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{profile.phone}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 justify-end">
                    <Link to="/profile" className="flex-1 sm:flex-none">
                      <Button variant="outline" size="sm" className="w-full">
                        <UserIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                        <span className="text-xs sm:text-sm">View Profile</span>
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="flex-1 sm:flex-none">
                      <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                      <span className="text-xs sm:text-sm">Logout</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KYC Status Card */}
          {profile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Verification Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-sm sm:text-base text-muted-foreground">KYC Status</span>
                    {getKYCStatusBadge()}
                  </div>
                  {!profile.kyc_submitted_at && (
                    <Link to="/kyc-upload" className="w-full sm:w-auto">
                      <Button size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                        Complete Verification
                      </Button>
                    </Link>
                  )}
                  {profile.kyc_status === 'rejected' && (
                    <Link to="/kyc-upload" className="w-full sm:w-auto">
                      <Button size="sm" variant="destructive" className="w-full sm:w-auto text-xs sm:text-sm">
                        Resubmit KYC
                      </Button>
                    </Link>
                  )}
                </div>
                {profile.kyc_status === 'rejected' && profile.kyc_rejection_reason && (
                  <div className="mt-3 bg-destructive/10 p-3 rounded text-xs sm:text-sm">
                    <p className="font-medium mb-1">Rejection Reason:</p>
                    <p className="break-words">{profile.kyc_rejection_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
              <TabsTrigger value="mchango" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Mchango
              </TabsTrigger>
              <TabsTrigger value="chama" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Chama
              </TabsTrigger>
            </TabsList>

            <TabsContent value="mchango" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">My Campaigns</h2>
                <Link to="/mchango/create" className="w-full sm:w-auto">
                  <Button variant="hero" size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                    <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Create Campaign
                  </Button>
                </Link>
              </div>

            {loading ? (
              <Card>
                <CardContent className="py-6 sm:py-8 text-center">
                  <p className="text-sm sm:text-base text-muted-foreground">Loading campaigns...</p>
                </CardContent>
              </Card>
            ) : mchangoList.length === 0 ? (
              <Card>
                <CardContent className="py-6 sm:py-8 text-center space-y-3 sm:space-y-4">
                  <p className="text-sm sm:text-base text-muted-foreground">You haven't created any campaigns yet</p>
                  <Link to="/mchango/create" className="inline-block">
                    <Button variant="hero" className="text-xs sm:text-sm">
                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
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
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base sm:text-lg break-words">{campaign.title}</CardTitle>
                              <CardDescription className="text-xs sm:text-sm break-words">{campaign.description}</CardDescription>
                            </div>
                            {daysLeft !== null && (
                              <Badge variant="secondary" className="text-xs self-start sm:self-auto flex-shrink-0">{daysLeft} days</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-xs sm:text-sm">
                            <span className="text-muted-foreground">
                              KES {Number(campaign.current_amount).toLocaleString()} raised
                            </span>
                            <span className="font-semibold text-foreground">
                              of KES {Number(campaign.target_amount).toLocaleString()}
                            </span>
                          </div>
                          <Progress value={progress} />
                          <div className="text-xs sm:text-sm text-muted-foreground">
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
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">My Groups</h2>
              <Link to="/chama/create" className="w-full sm:w-auto">
                <Button variant="heroSecondary" size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Create Group
                </Button>
              </Link>
            </div>

            {loading ? (
              <Card>
                <CardContent className="py-6 sm:py-8 text-center">
                  <p className="text-sm sm:text-base text-muted-foreground">Loading groups...</p>
                </CardContent>
              </Card>
            ) : chamaList.length === 0 && memberChamaList.length === 0 ? (
              <Card>
                <CardContent className="py-6 sm:py-8 text-center space-y-3 sm:space-y-4">
                  <p className="text-sm sm:text-base text-muted-foreground">You haven't joined any chama groups yet</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Link to="/chama/create" className="w-full sm:w-auto">
                      <Button variant="heroSecondary" className="w-full sm:w-auto text-xs sm:text-sm">
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                        Create Your First Group
                      </Button>
                    </Link>
                    <Link to="/chama/join" className="w-full sm:w-auto">
                      <Button variant="outline" className="w-full sm:w-auto text-xs sm:text-sm">
                        Join Existing Group
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Created Chamas */}
                {chamaList.length > 0 && (
                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Created by You
                    </h3>
                    <div className="space-y-4">
                      {chamaList.map((group) => (
                        <Link key={group.id} to={`/chama/${group.slug}`}>
                          <Card className="hover:shadow-md transition-shadow">
                            <CardHeader>
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-base sm:text-lg break-words">{group.name}</CardTitle>
                                  <CardDescription className="text-xs sm:text-sm break-words">{group.description}</CardDescription>
                                </div>
                                <Badge variant="default" className="text-xs self-start sm:self-auto flex-shrink-0">Manager</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                                <div>
                                  <p className="text-xs sm:text-sm text-muted-foreground">Contribution</p>
                                  <p className="text-lg sm:text-xl font-bold text-foreground">
                                    KES {Number(group.contribution_amount).toLocaleString()}
                                  </p>
                                </div>
                                <div className="sm:text-right">
                                  <p className="text-xs sm:text-sm text-muted-foreground">Frequency</p>
                                  <p className="text-base sm:text-lg font-semibold text-foreground capitalize">
                                    {group.contribution_frequency.replace('_', ' ')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground pt-2 border-t border-border">
                                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                Created: {new Date(group.created_at).toLocaleDateString()}
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Member Chamas */}
                {memberChamaList.length > 0 && (
                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Member Groups
                    </h3>
                    <div className="space-y-4">
                      {memberChamaList.map((group) => (
                        <Link key={group.id} to={`/chama/${group.slug}`}>
                          <Card className="hover:shadow-md transition-shadow">
                            <CardHeader>
                              <div className="flex justify-between items-start">
                                <div>
                                  <CardTitle className="text-lg">{group.name}</CardTitle>
                                  <CardDescription>{group.description}</CardDescription>
                                </div>
                                <Badge variant="secondary">Member</Badge>
                              </div>
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
                            </CardContent>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default Home;
