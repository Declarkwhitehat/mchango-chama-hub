import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, Check, X, Snowflake, Loader2, Clock } from "lucide-react";

interface ExecChange {
  id: string;
  welfare_id: string;
  change_type: string;
  old_role: string | null;
  new_role: string | null;
  affected_user_name: string | null;
  new_user_name: string | null;
  cooldown_hours: number;
  cooldown_ends_at: string;
  admin_decision: string;
  admin_decided_at: string | null;
  admin_notes: string | null;
  pending_withdrawals_cancelled: number;
  created_at: string;
  welfare_name?: string;
}

const AdminWelfareExecutiveChanges = () => {
  const [changes, setChanges] = useState<ExecChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    fetchChanges();
  }, [filter]);

  const fetchChanges = async () => {
    setLoading(true);
    let query = supabase
      .from('welfare_executive_changes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') {
      query = query.eq('admin_decision', filter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load executive changes");
      setLoading(false);
      return;
    }

    // Fetch welfare names
    const welfareIds = [...new Set((data || []).map((c: any) => c.welfare_id))];
    let welfareMap: Record<string, string> = {};
    if (welfareIds.length > 0) {
      const { data: welfares } = await supabase
        .from('welfares')
        .select('id, name')
        .in('id', welfareIds);
      for (const w of (welfares || [])) {
        welfareMap[w.id] = w.name;
      }
    }

    setChanges((data || []).map((c: any) => ({
      ...c,
      welfare_name: welfareMap[c.welfare_id] || 'Unknown',
    })));
    setLoading(false);
  };

  const handleAction = async (changeId: string, decision: 'approved' | 'rejected' | 'frozen') => {
    setActing(changeId);
    try {
      const updates: any = {
        admin_decision: decision,
        admin_decided_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('welfare_executive_changes')
        .update(updates)
        .eq('id', changeId);

      if (error) throw error;

      // If frozen, also freeze the welfare
      if (decision === 'frozen') {
        const change = changes.find(c => c.id === changeId);
        if (change) {
          await supabase
            .from('welfares')
            .update({ is_frozen: true, frozen_at: new Date().toISOString(), frozen_reason: 'Frozen by admin due to suspicious executive change' })
            .eq('id', change.welfare_id);
        }
      }

      toast.success(`Executive change ${decision}`);
      fetchChanges();
    } catch (error: any) {
      toast.error(error.message || "Action failed");
    } finally {
      setActing(null);
    }
  };

  const getTimeRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const decisionBadge = (d: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "destructive", label: "Pending" },
      approved: { variant: "default", label: "Approved" },
      rejected: { variant: "destructive", label: "Rejected" },
      frozen: { variant: "secondary", label: "Frozen" },
      auto_accepted: { variant: "outline", label: "Auto-Accepted" },
    };
    const info = map[d] || { variant: "outline" as const, label: d };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-destructive" />
              Welfare Executive Changes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review and act on executive role changes across welfare groups
            </p>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="frozen">Frozen</SelectItem>
              <SelectItem value="auto_accepted">Auto-Accepted</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : changes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No executive changes found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Welfare</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Cancelled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.map((change) => (
                    <TableRow key={change.id}>
                      <TableCell className="font-medium">{change.welfare_name}</TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          {change.affected_user_name && (
                            <div>
                              <span className="text-muted-foreground">Out:</span>{" "}
                              {change.affected_user_name}
                              {change.old_role && <Badge variant="outline" className="ml-1 capitalize text-xs">{change.old_role}</Badge>}
                            </div>
                          )}
                          {change.new_user_name && (
                            <div>
                              <span className="text-muted-foreground">In:</span>{" "}
                              {change.new_user_name}
                              {change.new_role && <Badge variant="outline" className="ml-1 capitalize text-xs">{change.new_role}</Badge>}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {change.admin_decision === 'pending' ? getTimeRemaining(change.cooldown_ends_at) : `${change.cooldown_hours}h`}
                        </div>
                      </TableCell>
                      <TableCell>
                        {change.pending_withdrawals_cancelled > 0 ? (
                          <Badge variant="destructive">{change.pending_withdrawals_cancelled}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">0</span>
                        )}
                      </TableCell>
                      <TableCell>{decisionBadge(change.admin_decision)}</TableCell>
                      <TableCell>
                        {change.admin_decision === 'pending' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleAction(change.id, 'approved')}
                              disabled={acting === change.id}
                              className="h-7 px-2 text-xs"
                            >
                              {acting === change.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAction(change.id, 'rejected')}
                              disabled={acting === change.id}
                              className="h-7 px-2 text-xs"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleAction(change.id, 'frozen')}
                              disabled={acting === change.id}
                              className="h-7 px-2 text-xs"
                            >
                              <Snowflake className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
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

export default AdminWelfareExecutiveChanges;
