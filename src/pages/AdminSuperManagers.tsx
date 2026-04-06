import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trophy, Crown, Users, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SuperManager {
  user_id: string;
  full_name: string;
  phone: string;
  total_groups: number;
  total_collected: number;
  entity_types: string[];
  groups: { name: string; type: string; collected: number; status: string }[];
}

const AdminSuperManagers = () => {
  const navigate = useNavigate();
  const [managers, setManagers] = useState<SuperManager[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuperManagers();
  }, []);

  const fetchSuperManagers = async () => {
    try {
      // Fetch creators across all entity types
      const [chamaRes, mchangoRes, orgRes, welfareRes] = await Promise.all([
        supabase.from("chama").select("created_by, name, status, total_gross_collected").not("total_gross_collected", "is", null),
        supabase.from("mchango").select("created_by, title, status, total_gross_collected").not("total_gross_collected", "is", null),
        supabase.from("organizations").select("created_by, name, status, total_gross_collected").not("total_gross_collected", "is", null),
        supabase.from("welfares").select("created_by, name, status, available_balance"),
      ]);

      const creatorMap = new Map<string, SuperManager>();

      const addGroup = (userId: string, name: string, type: string, collected: number, status: string) => {
        if (!creatorMap.has(userId)) {
          creatorMap.set(userId, {
            user_id: userId,
            full_name: "",
            phone: "",
            total_groups: 0,
            total_collected: 0,
            entity_types: [],
            groups: [],
          });
        }
        const mgr = creatorMap.get(userId)!;
        mgr.total_groups++;
        mgr.total_collected += collected;
        if (!mgr.entity_types.includes(type)) mgr.entity_types.push(type);
        mgr.groups.push({ name, type, collected, status });
      };

      (chamaRes.data || []).forEach(c => addGroup(c.created_by, c.name, "Chama", Number(c.total_gross_collected || 0), c.status));
      (mchangoRes.data || []).forEach(m => addGroup(m.created_by, m.title, "Campaign", Number(m.total_gross_collected || 0), m.status));
      (orgRes.data || []).forEach(o => addGroup(o.created_by, o.name, "Organization", Number(o.total_gross_collected || 0), o.status));
      (welfareRes.data || []).forEach(w => addGroup(w.created_by, w.name, "Welfare", Number(w.available_balance || 0), w.status));

      // Sort by total collected and take top 100
      const sorted = Array.from(creatorMap.values())
        .sort((a, b) => b.total_collected - a.total_collected)
        .slice(0, 100);

      // Fetch profiles
      const userIds = sorted.map(s => s.user_id);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", userIds);

        const profileMap = new Map<string, any>();
        profiles?.forEach(p => profileMap.set(p.id, p));

        sorted.forEach(mgr => {
          const p = profileMap.get(mgr.user_id);
          if (p) {
            mgr.full_name = p.full_name || "Unknown";
            mgr.phone = p.phone || "";
          }
        });
      }

      setManagers(sorted);
    } catch (err) {
      console.error("Error fetching super managers:", err);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Crown className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Crown className="h-5 w-5 text-amber-700" />;
    return <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>;
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-yellow-500" /> Super Managers
          </h1>
          <p className="text-muted-foreground mt-1">Top 100 group creators ranked by total collected across all entities</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Managers</p>
              <p className="text-2xl font-bold">{managers.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Combined Collections</p>
              <p className="text-2xl font-bold">KES {managers.reduce((s, m) => s + m.total_collected, 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Groups</p>
              <p className="text-2xl font-bold">{managers.reduce((s, m) => s + m.total_groups, 0)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>Creators with the highest success rate across Chamas, Campaigns, Organizations, and Welfares</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              </div>
            ) : managers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No data available yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Rank</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Groups</TableHead>
                    <TableHead>Types</TableHead>
                    <TableHead>Total Collected</TableHead>
                    <TableHead>Top Group</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managers.map((mgr, i) => {
                    const topGroup = mgr.groups.sort((a, b) => b.collected - a.collected)[0];
                    return (
                      <TableRow
                        key={mgr.user_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/admin/user/${mgr.user_id}`)}
                      >
                        <TableCell className="text-center">{getRankBadge(i)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{mgr.full_name}</p>
                            <p className="text-xs text-muted-foreground">{mgr.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-bold">{mgr.total_groups}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {mgr.entity_types.map(t => (
                              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-primary">
                          KES {mgr.total_collected.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {topGroup && (
                            <div className="text-xs">
                              <p className="font-medium">{topGroup.name}</p>
                              <p className="text-muted-foreground">{topGroup.type} · KES {topGroup.collected.toLocaleString()}</p>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminSuperManagers;
