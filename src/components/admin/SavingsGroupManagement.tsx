import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdjustMemberLimitDialog } from "@/components/admin/AdjustMemberLimitDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Ban, PlayCircle, Loader2, ExternalLink, Users, TrendingUp } from "lucide-react";
import { format } from "date-fns";
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
          saving_group_members(id, status, is_approved)
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge>Active</Badge>;
      case 'closed':
        return <Badge variant="destructive">Closed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

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
    <Card>
      <CardHeader>
        <CardTitle>Savings Group Management</CardTitle>
        <CardDescription>
          View and manage all savings groups ({groups.length} total)
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
        <div className="space-y-3">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No savings groups found</p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const activeMembers = group.saving_group_members?.filter(
                m => m.status === 'active' && m.is_approved
              ).length || 0;
              
              const progressPercent = group.saving_goal > 0 
                ? Math.round((Number(group.total_group_savings) / Number(group.saving_goal)) * 100)
                : 0;
              
              return (
                <div
                  key={group.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{group.name}</h3>
                        {getStatusBadge(group.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {group.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Manager: {group.profiles?.full_name} • Created {format(new Date(group.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="font-medium">
                        <Users className="h-3 w-3 inline mr-1" />
                        {activeMembers} / {group.max_members}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Savings</p>
                      <p className="font-medium">
                        KES {Number(group.total_group_savings).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saving Goal</p>
                      <p className="font-medium">
                        KES {Number(group.saving_goal).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Progress</p>
                      <p className="font-medium flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {progressPercent}%
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/savings-group/${group.id}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View
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
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};