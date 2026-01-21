import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, TrendingUp, Calendar, Heart, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Mchango {
  id: string;
  title: string;
  slug: string;
  description: string;
  target_amount: number;
  current_amount: number;
  status: string;
  category: string;
  end_date: string;
  created_at: string;
  created_by: string;
  image_url?: string;
}

const MchangoList = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mchangos, setMchangos] = useState<Mchango[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    if (authLoading) return;
    fetchMchangos();
  }, [sortBy, authLoading, user?.id]);

  const fetchMchangos = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('mchango')
        .select('*')
        .eq('status', 'active');

      // Apply sorting
      switch (sortBy) {
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'most-funded':
          query = query.order('current_amount', { ascending: false });
          break;
        case 'ending-soon':
          query = query.order('end_date', { ascending: true });
          break;
      }

      const { data, error } = await query;

      if (error) throw error;

      setMchangos(data || []);
    } catch (error: any) {
      console.error('Error fetching mchangos:', error);
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  const filteredMchangos = mchangos.filter(m => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      m.title.toLowerCase().includes(query) ||
      m.slug.toLowerCase().includes(query) ||
      m.description?.toLowerCase().includes(query)
    );
  });

  const myCampaigns = filteredMchangos.filter(m => m.created_by === user?.id);
  const otherCampaigns = filteredMchangos.filter(m => m.created_by !== user?.id);

  const calculateProgress = (current: number, target: number) => {
    return (current / target) * 100;
  };

  const getDaysLeft = (endDate: string) => {
    if (!endDate) return null;
    const now = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleSharePublicLink = async () => {
    const publicUrl = `${window.location.origin}/explore/mchango`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public link copied! Share it with anyone.");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container px-4 py-8 max-w-6xl mx-auto">
          <p className="text-center text-muted-foreground">Loading campaigns...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 py-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 rounded-full mb-2">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Campaigns</span>
          </div>
          <h1 className="text-4xl font-bold">Mchango Campaigns</h1>
          <p className="text-muted-foreground">
            Support meaningful causes and make a difference in people's lives
          </p>
          <Button variant="outline" onClick={handleSharePublicLink} className="gap-2">
            <Share2 className="h-4 w-4" />
            Share Public Link
          </Button>
        </div>

        {/* Search and Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, slug..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="most-funded">Most Funded</SelectItem>
                  <SelectItem value="ending-soon">Ending Soon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Campaign Grid */}
        {filteredMchangos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? "No campaigns match your search" : "No campaigns available"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* My Campaigns Section */}
            {myCampaigns.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">My Campaigns</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myCampaigns.map((mchango) => {
                    const progress = calculateProgress(
                      Number(mchango.current_amount),
                      Number(mchango.target_amount)
                    );
                    const daysLeft = getDaysLeft(mchango.end_date);

                    return (
                      <Card
                        key={mchango.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => navigate(`/mchango/${mchango.slug}`)}
                      >
                        <CardHeader>
                          <div className="flex justify-between items-start mb-2">
                            {mchango.category && (
                              <Badge variant="secondary">{mchango.category}</Badge>
                            )}
                            {daysLeft !== null && (
                              <Badge variant={daysLeft < 7 ? "destructive" : "default"}>
                                <Calendar className="h-3 w-3 mr-1" />
                                {daysLeft} days
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="line-clamp-2">{mchango.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {mchango.description}
                          </p>

                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                KES {Number(mchango.current_amount).toLocaleString()}
                              </span>
                              <span className="font-semibold">
                                of {Number(mchango.target_amount).toLocaleString()}
                              </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">
                                {progress.toFixed(1)}% funded
                              </span>
                            </div>
                          </div>

                          <Button
                            className="w-full"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/mchango/${mchango.slug}`);
                            }}
                          >
                            <Heart className="h-4 w-4 mr-2" />
                            View Campaign
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Other Campaigns Section */}
            {otherCampaigns.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Other Campaigns</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {otherCampaigns.map((mchango) => {
                    const progress = calculateProgress(
                      Number(mchango.current_amount),
                      Number(mchango.target_amount)
                    );
                    const daysLeft = getDaysLeft(mchango.end_date);

                    return (
                      <Card
                        key={mchango.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => navigate(`/mchango/${mchango.slug}`)}
                      >
                        <CardHeader>
                          <div className="flex justify-between items-start mb-2">
                            {mchango.category && (
                              <Badge variant="secondary">{mchango.category}</Badge>
                            )}
                            {daysLeft !== null && (
                              <Badge variant={daysLeft < 7 ? "destructive" : "default"}>
                                <Calendar className="h-3 w-3 mr-1" />
                                {daysLeft} days
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="line-clamp-2">{mchango.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {mchango.description}
                          </p>

                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">
                                KES {Number(mchango.current_amount).toLocaleString()}
                              </span>
                              <span className="font-semibold">
                                of {Number(mchango.target_amount).toLocaleString()}
                              </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">
                                {progress.toFixed(1)}% funded
                              </span>
                            </div>
                          </div>

                          <Button
                            className="w-full"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/mchango/${mchango.slug}`);
                            }}
                          >
                            <Heart className="h-4 w-4 mr-2" />
                            Donate Now
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default MchangoList;
