import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Plus, Search, Loader2, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const WelfareList = () => {
  const [welfares, setWelfares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWelfares();
  }, [user]);

  const fetchWelfares = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('welfare-crud', { method: 'GET' });
      if (error) throw error;
      setWelfares(data?.data || []);
    } catch (error: any) {
      console.error('Error fetching welfares:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-members', {
        method: 'POST',
        body: { group_code: joinCode.trim().toUpperCase() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Joined welfare group successfully!");
      setJoinCode("");
      fetchWelfares();
    } catch (error: any) {
      toast.error(error.message || "Failed to join welfare group");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Layout>
      <div className="container px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Welfare Groups
            </h1>
            <p className="text-sm text-muted-foreground">Manage your welfare memberships</p>
          </div>
          <Link to="/welfare/create">
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Create Welfare
            </Button>
          </Link>
        </div>

        {/* Join by Code */}
        {user && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Join by Code</CardTitle>
              <CardDescription>Enter a welfare group code to join</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter group code (e.g., AB12)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  className="flex-1"
                />
                <Button onClick={handleJoinByCode} disabled={joining || !joinCode.trim()}>
                  {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                  Join
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : welfares.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No welfare groups yet</p>
              <Link to="/welfare/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Welfare
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {welfares.map((welfare: any) => {
              const myRole = welfare.welfare_members?.find((m: any) => m.user_id === user?.id);
              return (
                <Link key={welfare.id} to={`/welfare/${welfare.id}`}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg break-words">{welfare.name}</CardTitle>
                          <CardDescription className="break-words">{welfare.description}</CardDescription>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {myRole && (
                            <Badge variant="default" className="capitalize">{myRole.role}</Badge>
                          )}
                          {welfare.is_frozen && (
                            <Badge variant="destructive">Frozen</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Balance: </span>
                          <span className="font-semibold">KES {Number(welfare.available_balance || 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Members: </span>
                          <span className="font-semibold">{welfare.welfare_members?.filter((m: any) => m.status === 'active').length || 0}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(welfare.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WelfareList;
