import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdjustMemberLimitDialog } from "@/components/admin/AdjustMemberLimitDialog";
import { SavingsGroupDetailCard } from "@/components/admin/SavingsGroupDetailCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Ban, PlayCircle, Loader2, PiggyBank } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SavingsGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  saving_goal: number;
  monthly_target: number;
  max_members: number;
  total_savings: number;
  total_group_savings: number;
  total_profits: number;
  status: string;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
  };
  saving_group_members: any[];
}

export const SavingsGroupManagement = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('saving_groups')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          ),
          saving_group_members(
            id, 
            user_id,
            current_savings, 
            lifetime_deposits,
            is_loan_eligible,
            joined_at,
            status, 
            is_approved,
            unique_member_id,
            profiles:user_id (
              full_name,
              email,
              phone
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const unique = Array.from(new Map((data || []).map((g: any) => [g.id, g])).values());
      setGroups(unique);
    } catch (error: any) {
      console.error('Error fetching savings groups:', error);
      toast({
        title: "Error",
        description: "Failed to load savings groups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateGroupStatus = async (groupId: string, newStatus: 'active' | 'closed') => {
    setProcessing(groupId);
    try {
      const { error } = await supabase
        .from('saving_groups')
        .update({ status: newStatus })
        .eq('id', groupId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Savings group ${newStatus === 'active' ? 'activated' : 'closed'}`,
      });

      await fetchGroups();
    } catch (error: any) {
      console.error('Error updating savings group:', error);
      toast({
        title: "Error",
        description: "Failed to update savings group status",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const filteredGroups = groups.filter(group => {
    const matchesSearch = 
      group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.profiles?.full_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === "all" || 
      group.status === statusFilter;

    return matchesSearch && matchesStatus;
  });


  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <PiggyBank className="h-6 w-6 text-primary" />
          Savings Group Management
        </CardTitle>
        <CardDescription className="text-base">
          View and manage all savings groups • {groups.length} total • {groups.filter(g => g.status === 'active').length} active
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search savings groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Groups List */}
        <div className="space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PiggyBank className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">No savings groups found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="space-y-2">
                <SavingsGroupDetailCard 
                  group={group} 
                  members={group.saving_group_members || []}
                />
                
                {/* Action Buttons */}
                <div className="flex gap-2 pl-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/savings-groups/${group.id}`)}
                  >
                    Open Full View
                  </Button>

                  <AdjustMemberLimitDialog
                    entityId={group.id}
                    entityName={group.name}
                    entityType="saving_groups"
                    currentLimit={group.max_members}
                    maxLimit={999}
                    onSuccess={fetchGroups}
                  />
                  
                  {group.status === 'active' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => updateGroupStatus(group.id, 'closed')}
                      disabled={processing === group.id}
                    >
                      {processing === group.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Ban className="h-4 w-4 mr-1" />
                          Close Group
                        </>
                      )}
                    </Button>
                  )}

                  {group.status === 'closed' && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => updateGroupStatus(group.id, 'active')}
                      disabled={processing === group.id}
                    >
                      {processing === group.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <PlayCircle className="h-4 w-4 mr-1" />
                          Reopen
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};