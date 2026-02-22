import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Users, Snowflake, Activity, Search, Eye, Lock, Unlock, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function FraudMonitoringDashboard() {
  const [stats, setStats] = useState({ flagged: 0, critical: 0, frozen: 0, events_today: 0 });
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        supabase.functions.invoke("fraud-monitor", { body: { action: "get-stats" } }),
        supabase.functions.invoke("fraud-monitor", {
          body: { action: "get-flagged-users", risk_level: riskFilter, search, page, page_size: 20 },
        }),
      ]);
      if (statsRes.data) setStats(statsRes.data);
      if (usersRes.data) {
        setUsers(usersRes.data.data || []);
        setTotal(usersRes.data.total || 0);
      }
    } catch (e) {
      console.error("Failed to fetch fraud data", e);
    } finally {
      setLoading(false);
    }
  }, [riskFilter, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (userId: string, adminAction: string) => {
    try {
      await supabase.functions.invoke("fraud-monitor", {
        body: { action: "admin-action", user_id: userId, admin_action: adminAction },
      });
      toast({ title: "Action applied", description: `User ${adminAction} successfully` });
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to apply action", variant: "destructive" });
    }
  };

  const statCards = [
    { label: "Flagged Users", value: stats.flagged, icon: ShieldAlert, color: "text-red-500" },
    { label: "Critical Risk", value: stats.critical, icon: AlertTriangle, color: "text-orange-500" },
    { label: "Events Today", value: stats.events_today, icon: Activity, color: "text-blue-500" },
    { label: "Frozen Accounts", value: stats.frozen, icon: Snowflake, color: "text-cyan-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Monitoring</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={riskFilter} onValueChange={(v) => { setRiskFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Risk Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flagged</TableHead>
                  <TableHead>Last Update</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : users.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                ) : users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{u.profiles?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{u.profiles?.phone}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-bold">{u.risk_score}</TableCell>
                    <TableCell><RiskScoreBadge level={u.risk_level} /></TableCell>
                    <TableCell>
                      {u.is_frozen ? (
                        <Badge variant="destructive">Frozen</Badge>
                      ) : u.review_status !== "none" ? (
                        <Badge variant="secondary">{u.review_status}</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.is_flagged ? <ShieldAlert className="h-4 w-4 text-red-500" /> : "—"}</TableCell>
                    <TableCell className="text-xs">{u.last_risk_update ? format(new Date(u.last_risk_update), "MMM d, HH:mm") : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/fraud-user/${u.user_id}`)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        {!u.is_frozen ? (
                          <Button size="sm" variant="ghost" onClick={() => handleAction(u.user_id, "frozen")}>
                            <Lock className="h-3 w-3 text-red-500" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => handleAction(u.user_id, "unfrozen")}>
                            <Unlock className="h-3 w-3 text-green-500" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleAction(u.user_id, "cleared")}>
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {total > 20 && (
            <div className="flex justify-between items-center mt-4">
              <p className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(total / 20)}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
