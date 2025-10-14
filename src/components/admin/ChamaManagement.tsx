import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdjustMemberLimitDialog } from "@/components/admin/AdjustMemberLimitDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Ban, PlayCircle, Loader2, ExternalLink, Users } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Chama {
  id: string;
  name: string;
  slug: string;
  description: string;
  contribution_amount: number;
  contribution_frequency: string;
  max_members: number;
  status: string;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
  };
  chama_members: any[];
}

export const ChamaManagement = () => {
  const navigate = useNavigate();
  const [chamas, setChamas] = useState<Chama[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchChamas();
  }, []);

  const fetchChamas = async () => {
    try {
      const { data, error } = await supabase
        .from('chama')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          ),
          chama_members(id, approval_status)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setChamas(data || []);
    } catch (error: any) {
      console.error('Error fetching chamas:', error);
      toast({
        title: "Error",
        description: "Failed to load chamas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateChamaStatus = async (chamaId: string, newStatus: 'active' | 'inactive' | 'completed') => {
    setProcessing(chamaId);
    try {
      const { error } = await supabase
        .from('chama')
        .update({ status: newStatus })
        .eq('id', chamaId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Chama ${newStatus === 'active' ? 'activated' : 'deactivated'}`,
      });

      await fetchChamas();
    } catch (error: any) {
      console.error('Error updating chama:', error);
      toast({
        title: "Error",
        description: "Failed to update chama status",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const filteredChamas = chamas.filter(chama => {
    const matchesSearch = 
      chama.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chama.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chama.profiles?.full_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === "all" || 
      chama.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge>Active</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'inactive':
        return <Badge variant="destructive">Inactive</Badge>;
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
        <CardTitle>Chama Management</CardTitle>
        <CardDescription>
          View and manage all chama groups ({chamas.length} total)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chamas..."
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
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chamas List */}
        <div className="space-y-3">
          {filteredChamas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No chamas found</p>
            </div>
          ) : (
            filteredChamas.map((chama) => {
              const approvedMembers = chama.chama_members?.filter(
                m => m.approval_status === 'approved'
              ).length || 0;
              
              return (
                <div
                  key={chama.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{chama.name}</h3>
                        {getStatusBadge(chama.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {chama.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By: {chama.profiles?.full_name} • Created {format(new Date(chama.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="font-medium">
                        <Users className="h-3 w-3 inline mr-1" />
                        {approvedMembers} / {chama.max_members}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contribution</p>
                      <p className="font-medium">
                        KES {Number(chama.contribution_amount).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Frequency</p>
                      <p className="font-medium capitalize">
                        {chama.contribution_frequency}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/chama/${chama.slug}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View
                    </Button>

                    <AdjustMemberLimitDialog
                      chamaId={chama.id}
                      chamaName={chama.name}
                      currentLimit={chama.max_members}
                      onSuccess={fetchChamas}
                    />
                    
                    {chama.status === 'active' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => updateChamaStatus(chama.id, 'inactive')}
                        disabled={processing === chama.id}
                      >
                        {processing === chama.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Ban className="h-4 w-4 mr-1" />
                            Deactivate
                          </>
                        )}
                      </Button>
                    )}

                    {chama.status === 'inactive' && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => updateChamaStatus(chama.id, 'active')}
                        disabled={processing === chama.id}
                      >
                        {processing === chama.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Activate
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
