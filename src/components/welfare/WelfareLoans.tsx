import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, HandCoins, AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { LOAN_TERMS, quoteLoan, fmtKES, WelfareLoanType } from "@/utils/welfareLoanTerms";

interface Props {
  welfareId: string;
  welfareName: string;
}

interface Overview {
  shares: number;
  payment_rate: number;
  months_member: number;
  days_member?: number;
  days_to_eligible?: number;
  min_months: number;
  min_rate: number;
  eligible: boolean;
  reasons: string[];
  max_multiplier: number;
  max_shares: number;
  member_code: string;
  welfare_balance: number;
  role: string;
  is_exec: boolean;
  is_admin: boolean;
  loans: any[];
  pending_approvals: any[];
}

const statusColor: Record<string, string> = {
  pending: "secondary",
  active: "default",
  overdue: "destructive",
  repaid: "outline",
  rejected: "outline",
  defaulted: "destructive",
};

export const WelfareLoans = ({ welfareId, welfareName }: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<WelfareLoanType | null>(null);
  const [amount, setAmount] = useState("");
  const [repayOpen, setRepayOpen] = useState<any | null>(null);
  const [repayAmount, setRepayAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const { data: res, error } = await supabase.functions.invoke("welfare-loans", {
        body: { action: "overview", welfare_id: welfareId },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as Overview);
    } catch (e: any) {
      toast.error(e?.message || "Could not load loan information.");
    } finally {
      setLoading(false);
    }
  }, [welfareId]);

  useEffect(() => { load(); }, [load]);

  const preview = useMemo(() => {
    const n = Number(amount);
    if (!selected || !Number.isFinite(n) || n <= 0) return null;
    return quoteLoan(selected, n);
  }, [selected, amount]);

  const submitRequest = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("welfare-loans", {
        body: { action: "request", welfare_id: welfareId, loan_type: selected, amount: Number(amount) },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success("Loan request sent. Two executives must approve it.");
      setSelected(null);
      setAmount("");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Could not submit your loan request.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (loanId: string, decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("welfare-loans", {
        body: { action: "decide", loan_id: loanId, decision },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success(
        decision === "rejected"
          ? "Loan declined."
          : (res as any).status === "approved"
            ? "Loan approved and being disbursed."
            : `Approval recorded (${(res as any).approvals}/2).`,
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || "Could not record your decision.");
    } finally {
      setBusy(false);
    }
  };

  const submitRepay = async () => {
    if (!repayOpen) return;
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("welfare-loans", {
        body: { action: "repay", loan_id: repayOpen.id, amount: Number(repayAmount) },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success("Check your phone and enter your M-Pesa PIN to complete the repayment.");
      setRepayOpen(null);
      setRepayAmount("");
      setTimeout(load, 8000);
    } catch (e: any) {
      toast.error(e?.message || "Could not start the repayment.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const openLoan = data.loans.find((l) => ["pending", "approved", "disbursing", "active", "overdue"].includes(l.status));

  return (
    <div className="space-y-4">
      {/* Shares summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HandCoins className="h-4 w-4" /> Your borrowing power
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Your shares</p>
              <p className="text-lg font-bold">{fmtKES(data.shares)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Membership</p>
              <p className="text-lg font-bold">
                {data.months_member} mo {Math.max(0, Math.floor((data.days_member ?? 0) - data.months_member * 30.44))} d
              </p>
              <p className="text-[11px] text-muted-foreground">{data.days_member ?? 0} days total</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Payment record</p>
              <p className="text-lg font-bold">{Math.round(data.payment_rate * 100)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Member ID</p>
              <p className="text-lg font-bold font-mono">{data.member_code}</p>
            </div>
          </div>
          <Progress
            value={Math.min(100, Math.round(((data.days_member ?? 0) / Math.max(1, data.min_months * 30.44)) * 100))}
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">
            You need {data.min_months} months of membership and a {Math.round(data.min_rate * 100)}% payment record to qualify.
            {(data.days_to_eligible ?? 0) > 0
              ? ` ${data.days_to_eligible} day(s) left before you can borrow.`
              : " Membership requirement met."}
          </p>
        </CardContent>
      </Card>

      {!data.eligible && !openLoan && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold mb-1">You are not eligible to borrow yet</p>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              {data.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Products */}
      {!openLoan && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["multiplier", "shares"] as WelfareLoanType[]).map((type) => {
            const t = LOAN_TERMS[type];
            const max = type === "multiplier" ? data.max_multiplier : data.max_shares;
            return (
              <Card key={type} className={selected === type ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t.tagline}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xl font-bold">{fmtKES(max)}</p>
                  <p className="text-xs text-muted-foreground">Maximum available to you</p>
                  <Separator />
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>{Math.round(t.chargeRate * 100)}% service charge deducted on disbursement</li>
                    <li>Repay the full amount within {t.termDays} days</li>
                    <li>
                      {type === "multiplier"
                        ? "5% added every month it stays unpaid"
                        : "Outstanding balance is recovered from your shares on default"}
                    </li>
                  </ul>
                  <Button
                    className="w-full"
                    disabled={!data.eligible || max < 500}
                    onClick={() => { setSelected(type); setAmount(String(Math.min(max, 5000))); }}
                  >
                    Apply
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Application form */}
      {selected && !openLoan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Apply for a {LOAN_TERMS[selected].label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount to borrow"
            />
            {preview && (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Loan amount</span><span className="font-semibold">{fmtKES(preview.principal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service charge ({Math.round(preview.chargeRate * 100)}%)</span><span className="font-semibold">-{fmtKES(preview.chargeAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">You receive</span><span className="font-bold text-primary">{fmtKES(preview.amountDisbursed)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">You repay within {preview.termDays} days</span><span className="font-bold">{fmtKES(preview.repayable)}</span></div>
                <p className="text-xs text-muted-foreground pt-1">An M-Pesa transaction fee applies to the amount sent to your phone.</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={submitRequest} disabled={busy || !preview}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit request
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Executive approvals */}
      {(data.is_exec || data.is_admin) && data.pending_approvals.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Loan requests awaiting approval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.pending_approvals.map((l: any) => (
              <div key={l.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">
                      {l.welfare_members?.profiles?.full_name || "Member"}{" "}
                      <span className="font-mono text-xs text-muted-foreground">{l.welfare_members?.member_code}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {LOAN_TERMS[l.loan_type as WelfareLoanType]?.label} · {fmtKES(l.principal)} · receives {fmtKES(l.amount_disbursed)}
                    </p>
                  </div>
                  <Badge variant="secondary">{(l.welfare_loan_approvals || []).filter((a: any) => a.decision === "approved").length}/2 approvals</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => decide(l.id, "approved")} disabled={busy}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(l.id, "rejected")} disabled={busy}>Decline</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* My loans */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your loans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.loans.length === 0 && (
            <p className="text-sm text-muted-foreground">You have not taken any loans from {welfareName}.</p>
          )}
          {data.loans.map((l: any) => (
            <div key={l.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{LOAN_TERMS[l.loan_type as WelfareLoanType]?.label} · {fmtKES(l.principal)}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.due_date ? `Due ${new Date(l.due_date).toLocaleDateString("en-GB")}` : "Awaiting approval"}
                  </p>
                </div>
                <Badge variant={(statusColor[l.status] || "secondary") as any} className="capitalize">
                  {l.status === "repaid" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : l.status === "pending" ? <Clock className="h-3 w-3 mr-1" /> : null}
                  {l.status}
                </Badge>
              </div>
              {["active", "overdue"].includes(l.status) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">Outstanding: <span className="font-bold">{fmtKES(l.balance)}</span></p>
                  <Button size="sm" onClick={() => { setRepayOpen(l); setRepayAmount(String(Math.round(Number(l.balance)))); }}>
                    Repay now
                  </Button>
                </div>
              )}
              {["active", "overdue"].includes(l.status) && (
                <p className="text-xs text-muted-foreground">
                  You can also repay offline via M-Pesa Paybill 4015351, Account {data.member_code}.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!repayOpen} onOpenChange={(o) => !o && setRepayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Repay your loan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Outstanding balance: <span className="font-semibold text-foreground">{fmtKES(repayOpen?.balance || 0)}</span>
            </p>
            <Input
              type="number"
              inputMode="numeric"
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder="Amount to repay"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRepayOpen(null)}>Cancel</Button>
            <Button onClick={submitRepay} disabled={busy || !Number(repayAmount)}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send M-Pesa prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WelfareLoans;
