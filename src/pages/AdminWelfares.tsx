import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Search, Loader2, Users, Eye, Snowflake, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const AdminWelfares = () => {
  const navigate = useNavigate();
  const [welfares, setWelfares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchWelfares();
  }, []);

  const fetchWelfares = async () => {
    try {
      const { data, error } = await supabase
        .from('welfares')
        .select('*, profiles:created_by(full_name, phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWelfares(data || []);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load welfares");
    } finally {
      setLoading(false);
    }
  };

  const toggleFreeze = async (welfare: any) => {
    try {
      const { error } = await supabase
        .from('welfares')
        .update({
          is_frozen: !welfare.is_frozen,
          frozen_at: !welfare.is_frozen ? new Date().toISOString() : null,
          frozen_reason: !welfare.is_frozen ? 'Frozen by admin' : null,
        })
        .eq('id', welfare.id);

      if (error) throw error;
      toast.success(welfare.is_frozen ? "Welfare unfrozen" : "Welfare frozen");
      fetchWelfares();
    } catch (e: any) {
      toast.error("Failed to update welfare");
    }
  };

  const handleUnverify = async (welfare: any) => {
    if (!welfare.is_verified) return; // Can only unverify — verification requires a customer request
    try {
      const { error } = await supabase
        .from('welfares')
        .update({ is_verified: false })
        .eq('id', welfare.id);

      if (error) throw error;
      toast.success("Verification removed");
      fetchWelfares();
    } catch (e: any) {
      toast.error("Failed to update welfare");
    }
  };

  const filtered = welfares.filter(w => {
    const matchesSearch = w.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.group_code?.toLowerCase().includes(search.toLowerCase()) ||
      (w as any).profiles?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7" /> Welfare Groups
          </h1>
          <p className="text-muted-foreground mt-1">Manage all welfare groups on the platform</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{welfares.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-primary">{welfares.filter(w => w.status === 'active').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Frozen</p>
              <p className="text-2xl font-bold text-destructive">{welfares.filter(w => w.is_frozen).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Verified</p>
              <p className="text-2xl font-bold text-green-600">{welfares.filter(w => w.is_verified).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, code, or creator..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No welfare groups found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Creator</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead className="hidden md:table-cell">Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{w.name}</span>
                          {w.is_verified && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                          {w.is_frozen && <Snowflake className="h-3.5 w-3.5 text-blue-500" />}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {(w as any).profiles?.full_name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        KES {Number(w.available_balance || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                        {w.group_code || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={w.status === 'active' ? 'default' : 'secondary'} className="text-xs capitalize">
                          {w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {format(new Date(w.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigate(`/welfare/${w.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleFreeze(w)}
                          >
                            {w.is_frozen ? "Unfreeze" : "Freeze"}
                          </Button>
                          {w.is_verified && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => handleUnverify(w)}
                            >
                              Unverify
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminWelfares;
