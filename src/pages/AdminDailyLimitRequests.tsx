import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Phone, AlertTriangle } from "lucide-react";

interface Req {
  id: string;
  user_id: string;
  current_limit: number;
  requested_limit: number;
  reason: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  expires_at: string | null;
}

interface UserContext {
  profile: any;
  phoneChangeCount: number;
  phoneAgeDays: number | null;
  txns: Array<{ kind: string; amount: number; when: string; status: string }>;
}

export default function AdminDailyLimitRequests() {
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Req | null>(null);
  const [ctx, setCtx] = useState<UserContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<number>(30);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("daily_limit_increase_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRequests((data as Req[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReview = async (r: Req) => {
    setSelected(r);
    setNotes(""); setDays(30);
    setCtxLoading(true);
    try {
      const sb = supabase as any;
      const [{ data: profile }, { data: phoneChanges }, { data: wds }, { data: contribs }, { data: donations }] = await Promise.all([
        sb.from("profiles").select("*").eq("id", r.user_id).maybeSingle(),
        sb.from("customer_callbacks").select("id, created_at, question")
          .ilike("question", "%Payment Method Change Request%")
          .contains("conversation_history", [{ user_id: r.user_id }]),
        sb.from("withdrawals").select("net_amount, requested_at, status")
          .eq("user_id", r.user_id).order("requested_at", { ascending: false }).limit(10),
        sb.from("contributions").select("amount, created_at, status")
          .eq("user_id", r.user_id).order("created_at", { ascending: false }).limit(10),
        sb.from("mchango_donations").select("amount, created_at, status")
          .eq("donor_user_id", r.user_id).order("created_at", { ascending: false }).limit(10),
      ]);

      const txns = [
        ...(wds ?? []).map((w: any) => ({ kind: "Withdrawal", amount: Number(w.net_amount), when: w.requested_at, status: w.status })),
        ...(contribs ?? []).map((c: any) => ({ kind: "Contribution", amount: Number(c.amount), when: c.created_at, status: c.status })),
        ...(donations ?? []).map((d: any) => ({ kind: "Donation", amount: Number(d.amount), when: d.created_at, status: d.status })),
      ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 15);

      const phoneUpdated = profile?.updated_at ? new Date(profile.updated_at) : null;
      const ageDays = phoneUpdated ? Math.floor((Date.now() - phoneUpdated.getTime()) / 86400000) : null;

      setCtx({
        profile,
        phoneChangeCount: phoneChanges?.length ?? 0,
        phoneAgeDays: ageDays,
        txns,
      });
    } finally {
      setCtxLoading(false);
    }
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!selected) return;
    setActing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-daily-limit-decision", {
        body: {
          request_id: selected.id,
          decision,
          admin_notes: notes || null,
          validity_days: decision === "approve" ? days : 0,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Request ${decision === "approve" ? "approved" : "rejected"}`);
      setSelected(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to process");
    } finally {
      setActing(false);
    }
  };

  const pending = requests.filter(r => r.status === "pending");
  const reviewed = requests.filter(r => r.status !== "pending");

  const renderList = (rows: Req[]) => (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No requests.</p>}
      {rows.map(r => (
        <Card key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openReview(r)}>
          <CardContent className="pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">KES {Number(r.requested_limit).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                <p className="text-sm mt-1 line-clamp-2">{r.reason}</p>
              </div>
              <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                {r.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Limit Requests</h1>
          <p className="text-muted-foreground">Approve or reject user payout limit increases</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="reviewed">Reviewed ({reviewed.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">{renderList(pending)}</TabsContent>
            <TabsContent value="reviewed" className="mt-4">{renderList(reviewed)}</TabsContent>
          </Tabs>
        )}

        <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review Limit Request</DialogTitle>
            </DialogHeader>

            {selected && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Request</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><strong>Requested:</strong> KES {Number(selected.requested_limit).toLocaleString()} (from KES {Number(selected.current_limit).toLocaleString()})</p>
                    <p><strong>Reason:</strong> {selected.reason}</p>
                    <p><strong>Submitted:</strong> {new Date(selected.created_at).toLocaleString()}</p>
                  </CardContent>
                </Card>

                {ctxLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : ctx && (
                  <>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">User</CardTitle></CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <p><strong>Name:</strong> {ctx.profile?.full_name}</p>
                        <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {ctx.profile?.phone}</p>
                        <p><strong>KYC:</strong> {ctx.profile?.kyc_status ?? "not submitted"}</p>
                        <p><strong>Verified:</strong> {ctx.profile?.is_verified ? "Yes" : "No"}</p>
                        <p><strong>Profile last updated:</strong> {ctx.phoneAgeDays !== null ? `${ctx.phoneAgeDays} day(s) ago` : "unknown"}</p>
                        {ctx.phoneChangeCount > 0 && (
                          <p className="flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> {ctx.phoneChangeCount} past phone-change request(s)
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">Latest transactions</CardTitle></CardHeader>
                      <CardContent className="text-sm">
                        {ctx.txns.length === 0 ? (
                          <p className="text-muted-foreground">No transactions.</p>
                        ) : (
                          <div className="space-y-1">
                            {ctx.txns.map((t, i) => (
                              <div key={i} className="flex justify-between border-b pb-1">
                                <span>{t.kind}</span>
                                <span>KES {t.amount.toLocaleString()}</span>
                                <span className="text-xs text-muted-foreground">{new Date(t.when).toLocaleDateString()}</span>
                                <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}

                {selected.status === "pending" && (
                  <>
                    <div className="space-y-2">
                      <Label>Admin notes (optional)</Label>
                      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
                    </div>
                    <div className="space-y-2">
                      <Label>Approval validity (days)</Label>
                      <Input type="number" value={days} min={1} max={365} onChange={(e) => setDays(Number(e.target.value))} />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="destructive" className="flex-1" onClick={() => decide("reject")} disabled={acting}>
                        <XCircle className="h-4 w-4 mr-2" /> Reject
                      </Button>
                      <Button className="flex-1" onClick={() => decide("approve")} disabled={acting}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
