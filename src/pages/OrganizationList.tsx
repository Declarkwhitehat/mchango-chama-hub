import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Building2, MapPin, Globe, Share2, Plus } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  about: string;
  category: string;
  logo_url?: string;
  cover_image_url?: string;
  location?: string;
  website_url?: string;
  current_amount: number;
  total_gross_collected: number | null;
  is_verified: boolean;
  status: string;
  created_at: string;
  created_by: string;
}

const OrganizationList = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [verifiedFilter, setVerifiedFilter] = useState("all");

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, description, category, current_amount, location, logo_url, is_verified, created_at')
        .eq('status', 'active')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error: any) {
      console.error('Error fetching organizations:', error);
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    // Verified filter
    if (verifiedFilter === "verified" && !org.is_verified) return false;
    if (verifiedFilter === "unverified" && org.is_verified) return false;

    const matchesSearch = !searchQuery || 
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.category?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || org.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const myOrganizations = filteredOrganizations.filter(org => org.created_by === user?.id);
  const otherOrganizations = filteredOrganizations.filter(org => org.created_by !== user?.id);

  const categories = [...new Set(organizations.map(org => org.category).filter(Boolean))];

  const handleSharePublicLink = async () => {
    const publicUrl = `${window.location.origin}/organizations`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public link copied! Share it with anyone.");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const OrganizationCard = ({ org }: { org: Organization }) => (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-300 group overflow-hidden"
      onClick={() => navigate(`/organizations/${org.slug}`)}
    >
      {org.cover_image_url && (
        <div className="h-32 overflow-hidden">
          <img 
            src={org.cover_image_url} 
            alt={org.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {org.logo_url ? (
            <img 
              src={org.logo_url} 
              alt={org.name}
              className="w-12 h-12 rounded-lg object-cover border bg-background"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg line-clamp-1">{org.name}</CardTitle>
              {org.is_verified && (
                <VerifiedBadge size="sm" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {org.category}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {org.description}
        </p>
        
        {org.location && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {org.location}
          </div>
        )}
        
        <div className="pt-3 border-t">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Contributions</p>
            <p className="text-xl font-bold text-primary">
              KES {Number(org.total_gross_collected || org.current_amount).toLocaleString()}
            </p>
          </div>
        </div>

        <Button className="w-full" variant="default">
          View Organization
        </Button>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Layout>
        <div className="container px-4 py-8 max-w-6xl mx-auto">
          <p className="text-center text-muted-foreground">Loading organizations...</p>
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
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Organizations</span>
          </div>
          <h1 className="text-4xl font-bold">Support Organizations</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Discover and support verified churches, schools, orphanages, NGOs and other organizations making a difference in their communities.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={handleSharePublicLink} className="gap-2">
              <Share2 className="h-4 w-4" />
              Share Public Link
            </Button>
            {user && profile?.kyc_status === 'approved' && (
              <Button onClick={() => navigate('/organizations/create')} className="gap-2">
                <Plus className="h-4 w-4" />
                Register Organization
              </Button>
            )}
          </div>
        </div>

        {/* Search and Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search organizations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
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

        {/* Organizations Grid */}
        {filteredOrganizations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery || categoryFilter !== "all" 
                  ? "No organizations match your search" 
                  : "No organizations available yet"}
              </p>
              {user && profile?.kyc_status === 'approved' && (
                <Button 
                  onClick={() => navigate('/organizations/create')} 
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Register the First Organization
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* My Organizations */}
            {myOrganizations.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">My Organizations</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myOrganizations.map(org => (
                    <OrganizationCard key={org.id} org={org} />
                  ))}
                </div>
              </div>
            )}

            {/* Other Organizations */}
            {otherOrganizations.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">
                  {myOrganizations.length > 0 ? "Other Organizations" : "All Organizations"}
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {otherOrganizations.map(org => (
                    <OrganizationCard key={org.id} org={org} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default OrganizationList;
