import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Heart, Calendar, TrendingUp } from "lucide-react";
import { ShareMenu } from "@/components/ShareMenu";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { toast } from "sonner";

interface Mchango {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  total_gross_collected: number | null;
  status: string;
  end_date: string | null;
  category: string | null;
  image_url: string | null;
  created_at: string;
  is_verified: boolean;
}

const MchangoExplore = () => {
  const [mchangos, setMchangos] = useState<Mchango[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [verifiedFilter, setVerifiedFilter] = useState("all");

  useEffect(() => {
    fetchMchangos();
  }, [sortBy]);

  const fetchMchangos = async () => {
    try {
      let query = supabase
        .from("mchango")
        .select("id, title, slug, description, target_amount, current_amount, total_gross_collected, status, end_date, category, image_url, created_at, is_verified")
        .eq("status", "active")
        .eq("is_public", true);

      switch (sortBy) {
        case "most-funded":
          query = query.order("current_amount", { ascending: false });
          break;
        case "ending-soon":
          query = query.not("end_date", "is", null).order("end_date", { ascending: true });
          break;
        default:
          query = query.order("created_at", { ascending: false });
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setMchangos(data || []);
    } catch (error) {
      console.error("Error fetching mchangos:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  const filteredMchangos = mchangos.filter(
    (m) => {
      // Hide expired campaigns (0 days left) from public view
      const daysRemaining = getDaysLeft(m.end_date);
      if (daysRemaining === 0) return false;

      // Verified filter
      if (verifiedFilter === "verified" && !m.is_verified) return false;
      if (verifiedFilter === "unverified" && m.is_verified) return false;

      return m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category?.toLowerCase().includes(searchQuery.toLowerCase());
    }
  );

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const getDaysLeft = (endDate: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const exploreShareUrl = window.location.href;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-primary/10 py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <Heart className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Support Causes That Matter
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Browse active fundraising campaigns and make a difference. Every contribution counts!
          </p>
          <Button onClick={handleSharePage} variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share This Page
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Search and Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="most-funded">Most Funded</SelectItem>
              <SelectItem value="ending-soon">Ending Soon</SelectItem>
            </SelectContent>
          </Select>
          <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Verification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="verified">Verified Only</SelectItem>
              <SelectItem value="unverified">Unverified</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground mb-6">
          {filteredMchangos.length} active campaign{filteredMchangos.length !== 1 ? "s" : ""} found
        </p>

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading campaigns...</p>
          </div>
        ) : filteredMchangos.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No campaigns found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "Try adjusting your search" : "Check back later for new campaigns"}
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Campaign Grid */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMchangos.map((mchango) => {
              const allTimeCollected = Number(mchango.total_gross_collected) || mchango.current_amount;
              const progress = calculateProgress(allTimeCollected, mchango.target_amount);
              const daysLeft = getDaysLeft(mchango.end_date);

              return (
                <Card key={mchango.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  {mchango.image_url && (
                    <div className="h-40 overflow-hidden">
                      <img
                        src={mchango.image_url}
                        alt={mchango.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-2 flex items-center gap-2">
                        {mchango.title}
                        {mchango.is_verified && <VerifiedBadge size="sm" />}
                      </CardTitle>
                      {mchango.category && (
                        <Badge variant="secondary" className="shrink-0">
                          {mchango.category}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2">
                      {mchango.description || "Help support this cause"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">
                          KES {allTimeCollected.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          of KES {mchango.target_amount.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {progress.toFixed(0)}% funded
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {daysLeft !== null && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{daysLeft} days left</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Donate Button */}
                    <Link to={`/mchango/${mchango.slug}`}>
                      <Button className="w-full gap-2">
                        <Heart className="h-4 w-4" />
                        Donate Now
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-muted/50 py-8 px-4 mt-12">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-muted-foreground">
            Want to start your own fundraising campaign?{" "}
            <Link to="/auth" className="text-primary hover:underline font-medium">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default MchangoExplore;
