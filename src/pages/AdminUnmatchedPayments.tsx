import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

interface Row {
  id: string;
  mpesa_receipt_number: string;
  amount: number;
  phone_number: string | null;
  account_number: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  failure_reason: string | null;
  status: string;
  created_at: string;
  allocated_to_type: string | null;
  allocated_to_id: string | null;
}

export default function AdminUnmatchedPayments() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFor, setShowFor] = useState<Row | null>(null);
  const [targetCode, setTargetCode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("unmatched_c2b_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data as Row[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function allocate() {
    if (!showFor) return;
    const code = targetCode.trim().toUpperCase();
    if (!code) { toast({ title: "Enter destination code", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // Ask the server (via c2b-confirm-payment) to reprocess this payment with the correct code.
      const { data, error } = await supabase.functions.invoke("c2b-confirm-payment", {
        body: {
          TransID: showFor.mpesa_receipt_number + "-RETRY",
          TransAmount: showFor.amount,
          BillRefNumber: code,
          MSISDN: showFor.phone_number || "",
          FirstName: showFor.first_name || "",
          MiddleName: showFor.middle_name || "",
          LastName: showFor.last_name || "",
        },
      });
      if (error) throw error;
      const matched = (data as any)?.matched !== false;
      await supabase.from("unmatched_c2b_payments").update({
        status: matched ? "allocated" : "pending",
        notes: notes || null,
        allocated_at: matched ? new Date().toISOString() : null,
      }).eq("id", showFor.id);
      toast({
        title: matched ? "Allocated" : "Still unmatched",
        description: matched ? `Applied to ${code}` : `Code ${code} not found`,
        variant: matched ? "default" : "destructive",
      });
      setShowFor(null);
      setTargetCode("");
      setNotes("");
      load();
    } catch (e: any) {
      toast({ title: "Allocation failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl md:text-2xl font-bold">Unmatched Offline Payments</h1>
        <Button variant="outline" size="sm" className="ml-auto" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <div className="text-sm">
            <div className="font-semibold">{pending.length} payment(s) awaiting allocation</div>
            <div className="text-muted-foreground">
              Offline Paybill payments that couldn't be auto-matched or failed processing. Money is safe — allocate to the correct account below.
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No unmatched payments.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">
                    KES {Number(r.amount).toLocaleString()} · {r.mpesa_receipt_number}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant={r.status === "allocated" ? "default" : "destructive"}>
                  {r.status}
                </Badge>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Payer:</span> {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") || "—"} · {r.phone_number || "—"}</div>
                <div><span className="text-muted-foreground">Entered code:</span> <span className="font-mono">{r.account_number || "—"}</span></div>
                {r.failure_reason && (
                  <div className="text-amber-600"><span className="text-muted-foreground">Reason:</span> {r.failure_reason}</div>
                )}
                {r.status === "allocated" && r.allocated_to_type && (
                  <div className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Allocated to {r.allocated_to_type}
                  </div>
                )}
                {r.status !== "allocated" && (
                  <div className="pt-2">
                    <Button size="sm" onClick={() => { setShowFor(r); setTargetCode(r.account_number || ""); }}>
                      Allocate to correct account
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!showFor} onOpenChange={(o) => !o && setShowFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Receipt <span className="font-mono">{showFor?.mpesa_receipt_number}</span> · KES {showFor?.amount}
            </div>
            <div>
              <Label htmlFor="code">Correct account code (Member ID, Group Code, or Paybill Account)</Label>
              <Input id="code" value={targetCode} onChange={(e) => setTargetCode(e.target.value)} placeholder="e.g. NBGYM0001" />
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFor(null)}>Cancel</Button>
            <Button onClick={allocate} disabled={saving}>{saving ? "Allocating…" : "Allocate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
