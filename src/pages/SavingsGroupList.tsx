import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PlusCircle, Search, Users, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";

interface SavingsGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  saving_goal: number;
  max_members: number;
  total_savings: number;
  status: string;
  created_at: string;
  member_count?: number;
}

export default function SavingsGroupList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const { data: groupsData, error } = await supabase
        .from("saving_groups")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get member counts
      const groupsWithCounts = await Promise.all(
        (groupsData || []).map(async (group) => {
          const { count } = await supabase
            .from("saving_group_members")
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id)
            .eq("status", "active");

          return { ...group, member_count: count || 0 };
        })
      );

      setGroups(groupsWithCounts);
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

  const filteredGroups = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Savings Groups
            </h1>
            <p className="text-muted-foreground">
              Join a savings group or create your own
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => navigate("/savings-group/create")}
            className="w-full sm:w-auto"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Create Group
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Groups Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-6 bg-muted rounded mb-4" />
                <div className="h-4 bg-muted rounded mb-2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </Card>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No groups found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? "Try adjusting your search"
                : "Be the first to create a savings group"}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate("/savings-group/create")}>
                <PlusCircle className="mr-2 h-5 w-5" />
                Create Group
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group) => (
              <Card
                key={group.id}
                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/savings-group/${group.id}`)}
              >
                <h3 className="text-xl font-bold mb-2 text-foreground">
                  {group.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {group.description || "No description provided"}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      Members
                    </span>
                    <span className="font-semibold">
                      {group.member_count} / {group.max_members}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Total Savings
                    </span>
                    <span className="font-semibold">
                      KES {group.total_savings.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Goal</span>
                    <span className="font-semibold">
                      KES {group.saving_goal.toLocaleString()}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="pt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        {Math.min(
                          100,
                          Math.round((group.total_savings / group.saving_goal) * 100)
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (group.total_savings / group.saving_goal) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <Button className="w-full mt-4" variant="outline">
                  View Group
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
