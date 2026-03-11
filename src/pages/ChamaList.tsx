import { useEffect, useState } from "react";
import { formatDate } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Calendar, TrendingUp } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { JoinByCodeForm } from "@/components/chama/JoinByCodeForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Chama {
  id: string;
  name: string;
  slug: string;
  description: string;
  contribution_amount: number;
  contribution_frequency: string;
  max_members: number;
  status: string;
  is_verified: boolean;
  created_at: string;
  profiles: {
    full_name: string;
  } | null;
  chama_members: Array<{
    approval_status: string;
  }>;
}

const ChamaList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chamas, setChamas] = useState<Chama[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [verifiedFilter, setVerifiedFilter] = useState("all");

  useEffect(() => {
    fetchChamas();
  }, [sortBy, user]);

  const fetchChamas = async () => {
    try {
      setLoading(true);
      
      // Fetch public chamas
      let publicQuery = supabase
        .from('chama')
        .select(`
          *,
          profiles!chama_created_by_fkey(full_name),
          chama_members(approval_status)
        `)
        .in('status', ['pending', 'active', 'cycle_complete'])
        .eq('is_public', true);

      if (sortBy === 'newest') {
        publicQuery = publicQuery.order('created_at', { ascending: false });
      }

      const { data: publicData, error: publicError } = await publicQuery;
      if (publicError) throw publicError;

      let allChamas = publicData || [];

      // If logged in, also fetch user's own private chamas + chamas they're a member of
      if (user) {
        const { data: myChamas, error: myError } = await supabase
          .from('chama')
          .select(`
            *,
            profiles!chama_created_by_fkey(full_name),
            chama_members(approval_status)
          `)
          .in('status', ['pending', 'active', 'cycle_complete'])
          .eq('is_public', false);

        if (!myError && myChamas) {
          allChamas = [...allChamas, ...myChamas];
        }
      }

      const unique = Array.from(new Map(allChamas.map((c: any) => [c.id, c])).values());
      setChamas(unique);
    } catch (error: any) {
      console.error('Error fetching chamas:', error);
      toast.error("Failed to load chama groups");
    } finally {
      setLoading(false);
    }
  };

  const filteredChamas = chamas.filter(c => {
    // Verified filter
    if (verifiedFilter === "verified" && !c.is_verified) return false;
    if (verifiedFilter === "unverified" && c.is_verified) return false;

    // Search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.slug.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query) ||
      c.profiles?.full_name?.toLowerCase().includes(query)
    );
  });

  const sortedChamas = [...filteredChamas].sort((a, b) => {
    if (sortBy === 'members') {
      const aMembers = a.chama_members?.filter(m => m.approval_status === 'approved').length || 0;
      const bMembers = b.chama_members?.filter(m => m.approval_status === 'approved').length || 0;
      return bMembers - aMembers;
    }
    return 0; // Already sorted by database query
  });

  if (loading) {
    return (
      <Layout>
        <div className="container px-4 py-8 max-w-6xl mx-auto">
          <p className="text-center text-muted-foreground">Loading chama groups...</p>
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
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Chama Groups</span>
          </div>
          <h1 className="text-4xl font-bold">Chama Groups</h1>
          <p className="text-muted-foreground">
            Join a chama group and start saving together
          </p>
        </div>

        {/* Join a Chama */}
        {user && <JoinByCodeForm />}

        {/* Search and Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, slug, or manager..."
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
                  <SelectItem value="members">Most Members</SelectItem>
                </SelectContent>
              </Select>
              <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="verified">Verified Only</SelectItem>
                  <SelectItem value="unverified">Unverified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Chama Grid */}
        {sortedChamas.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? "No chama groups match your search" : "No chama groups available"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedChamas.map((chama) => {
              const approvedMembers = chama.chama_members?.filter(m => m.approval_status === 'approved').length || 0;

              return (
                <Card
                  key={chama.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/chama/${chama.slug}`)}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge>
                        <Users className="h-3 w-3 mr-1" />
                        {approvedMembers}/{chama.max_members}
                      </Badge>
                      <Badge variant={chama.status === 'pending' ? 'secondary' : chama.status === 'cycle_complete' ? 'outline' : 'default'}>
                        {chama.status === 'pending' ? 'Forming' : chama.status === 'cycle_complete' ? 'Cycle Complete' : 'Active'}
                      </Badge>
                    </div>
                    <CardTitle className="line-clamp-1 flex items-center gap-2">
                      {chama.name}
                      {chama.is_verified && <VerifiedBadge size="sm" />}
                    </CardTitle>
                    <CardDescription className="line-clamp-1">
                      Manager: {chama.profiles?.full_name || 'Unknown'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {chama.description}
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">
                          KES {chama.contribution_amount.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">per {chama.contribution_frequency}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Created {formatDate(chama.created_at)}</span>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      variant="default"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/chama/${chama.slug}`);
                      }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ChamaList;
