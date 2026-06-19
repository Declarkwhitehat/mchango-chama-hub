import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AdminActionRow {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action_key: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface AdminOption {
  id: string;
  label: string;
}

const PAGE_SIZE = 50;

export const AuditLogsTable = () => {
  // System audit (existing audit_logs)
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsPage, setLogsPage] = useState(0);
  const [logsHasMore, setLogsHasMore] = useState(true);

  // Admin action log (new)
  const [actions, setActions] = useState<AdminActionRow[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsPage, setActionsPage] = useState(0);
  const [actionsHasMore, setActionsHasMore] = useState(true);

  // Filters for admin action log
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [filterAdmin, setFilterAdmin] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterSearch, setFilterSearch] = useState<string>("");

  useEffect(() => {
    fetchAuditLogs(0);
    loadAdmins();
  }, []);

  useEffect(() => {
    fetchAdminActions(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAdmin, filterAction]);

  const loadAdmins = async () => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "super_admin"] as any);
    const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
    if (ids.length === 0) return;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    const opts: AdminOption[] = (profiles || []).map((p: any) => ({
      id: p.id,
      label: `${p.full_name || "Unknown"} (${p.email || ""})`,
    }));
    setAdmins(opts);
  };

  const fetchAuditLogs = async (pageNum: number) => {
    try {
      setLogsLoading(true);
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, action, table_name, record_id, ip_address, created_at")
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      const newData = data || [];
      setLogsHasMore(newData.length === PAGE_SIZE);
      setLogs(pageNum === 0 ? newData : (prev) => [...prev, ...newData] as any);
      setLogsPage(pageNum);
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to load audit logs", variant: "destructive" });
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchAdminActions = async (pageNum: number) => {
    try {
      setActionsLoading(true);
      let q = supabase
        .from("admin_action_log" as any)
        .select("id, actor_user_id, actor_email, action_key, target_type, target_id, metadata, ip_address, created_at")
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
      if (filterAdmin !== "all") q = q.eq("actor_user_id", filterAdmin);
      if (filterAction !== "all") q = q.eq("action_key", filterAction);
      const { data, error } = await q;
      if (error) throw error;
      const newData = (data || []) as unknown as AdminActionRow[];
      setActionsHasMore(newData.length === PAGE_SIZE);
      setActions(pageNum === 0 ? newData : (prev) => [...prev, ...newData] as any);
      setActionsPage(pageNum);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to load admin actions", variant: "destructive" });
    } finally {
      setActionsLoading(false);
    }
  };

  const actionKeys = useMemo(() => {
    return Array.from(new Set(actions.map((a) => a.action_key))).sort();
  }, [actions]);

  const filteredActions = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.action_key.toLowerCase().includes(q) ||
        (a.actor_email || "").toLowerCase().includes(q) ||
        (a.target_id || "").toLowerCase().includes(q) ||
        JSON.stringify(a.metadata || {}).toLowerCase().includes(q)
    );
  }, [actions, filterSearch]);

  const getActionBadge = (action: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      INSERT: "default",
      UPDATE: "secondary",
      DELETE: "destructive",
    };
    return <Badge variant={variants[action] || "outline"}>{action}</Badge>;
  };

  const humanizeKey = (key: string) =>
    key.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Tabs defaultValue="admin-actions" className="w-full">
      <TabsList>
        <TabsTrigger value="admin-actions">Admin Actions</TabsTrigger>
        <TabsTrigger value="system">System Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="admin-actions">
        <Card>
          <CardHeader>
            <CardTitle>Admin Action Log</CardTitle>
            <CardDescription>Who did what, when, and from where.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Select value={filterAdmin} onValueChange={setFilterAdmin}>
                <SelectTrigger><SelectValue placeholder="All admins" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All admins</SelectItem>
                  {admins.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actionKeys.map((k) => (
                    <SelectItem key={k} value={k}>{humanizeKey(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search email, target, metadata..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>

            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {actionsLoading ? "Loading..." : "No admin actions recorded yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActions.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(row.created_at), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.actor_email || (row.actor_user_id ? row.actor_user_id.slice(0, 8) + "..." : "System")}
                        </TableCell>
                        <TableCell><Badge variant="secondary">{humanizeKey(row.action_key)}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">
                          {row.target_type ? `${row.target_type}:${(row.target_id || "").slice(0, 12)}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{row.ip_address || "—"}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate" title={JSON.stringify(row.metadata)}>
                          {Object.keys(row.metadata || {}).length > 0
                            ? JSON.stringify(row.metadata)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {actionsHasMore && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => fetchAdminActions(actionsPage + 1)} disabled={actionsLoading}>
                  {actionsLoading ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="system">
        <Card>
          <CardHeader>
            <CardTitle>System Audit</CardTitle>
            <CardDescription>All database-level INSERT/UPDATE/DELETE events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {logsLoading ? "Loading..." : "No audit logs found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{new Date(log.created_at).toLocaleString()}</TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell className="font-mono text-sm">{log.table_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {log.user_id ? log.user_id.substring(0, 8) + "..." : "System"}
                        </TableCell>
                        <TableCell className="text-sm">{log.ip_address || "N/A"}</TableCell>
                        <TableCell className="text-xs">
                          {log.record_id && (
                            <span className="text-muted-foreground">
                              ID: {log.record_id.substring(0, 8)}...
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {logsHasMore && (
              <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" onClick={() => fetchAuditLogs(logsPage + 1)} disabled={logsLoading}>
                  {logsLoading ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};
