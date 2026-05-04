import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, BadgeCheck, CheckCircle2, XCircle, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Req {
  id: string; user_id: string; selfie_path: string; fee_amount: number;
  payment_status: string; status: string; rejection_reason?: string | null;
  created_at: string; paid_at?: string | null;
  profile?: { full_name?: string | null; phone?: string | null; email?: string | null };
  selfie_url?: string;
}

const AdminAccountVerifications = () => {
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_verification_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) {
      const userIds = Array.from(new Set(data.map((r: any) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles").select("id,full_name,phone,email").in("id", userIds);
      const profMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const enriched: Req[] = await Promise.all(data.map(async (r: any) => {
        const { data: signed } = await supabase.storage.from("verification-selfies").createSignedUrl(r.selfie_path, 600);
        return { ...r, profile: profMap.get(r.user_id), selfie_url: signed?.signedUrl };
      }));
      setRequests(enriched);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-account-verification", {
        body: { request_id: id, action, rejection_reason: reasons[id] },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: action === "approve" ? "Approved" : "Rejected" });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  if (loading) return (
    <AdminLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><BadgeCheck className="h-7 w-7" /> Account Verifications</h1>
          <p className="text-muted-foreground mt-1">Review user account verification requests. Only paid requests can be approved.</p>
        </div>

        {requests.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No verification requests yet</CardContent></Card>
        ) : requests.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">{r.profile?.full_name || "Unknown user"}</CardTitle>
                  <CardDescription>{r.profile?.phone} • {r.profile?.email}</CardDescription>
                  <p className="text-xs text-muted-foreground mt-1">Requested {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={r.payment_status === "paid" ? "default" : "secondary"}>{r.payment_status}</Badge>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">KES {Number(r.fee_amount).toLocaleString()}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                {r.selfie_url ? (
                  <a href={r.selfie_url} target="_blank" rel="noreferrer">
                    <img src={r.selfie_url} alt="selfie" className="h-32 w-32 object-cover rounded-lg border" />
                  </a>
                ) : (
                  <div className="h-32 w-32 rounded-lg border bg-muted flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                )}
              </div>
              {r.status === "pending" && (
                <>
                  <Textarea
                    placeholder="Rejection reason (required if rejecting)"
                    value={reasons[r.id] || ""}
                    onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => act(r.id, "approve")} disabled={busy === r.id || r.payment_status !== "paid"} className="gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </Button>
                    <Button variant="destructive" onClick={() => act(r.id, "reject")} disabled={busy === r.id} className="gap-2">
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                  {r.payment_status !== "paid" && (
                    <p className="text-xs text-amber-700">Cannot approve: payment not yet received.</p>
                  )}
                </>
              )}
              {r.status === "rejected" && r.rejection_reason && (
                <p className="text-sm text-muted-foreground">Reason: {r.rejection_reason}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default AdminAccountVerifications;
