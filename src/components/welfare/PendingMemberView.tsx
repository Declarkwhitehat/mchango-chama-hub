import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock, Copy, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GroupDocuments } from "@/components/GroupDocuments";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhone } from "@/utils/phoneUtils";

interface Props {
  welfare: any;
  member: any;
  onPaid: () => void;
}

function useCountdown(targetISO?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetISO) return null;
  const diff = new Date(targetISO).getTime() - now;
  if (diff <= 0) return { expired: true, d: 0, h: 0, m: 0, s: 0 };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { expired: false, d, h, m, s };
}

const copy = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Failed to copy");
  }
};

export const PendingMemberView = ({ welfare, member, onPaid }: Props) => {
  const { user, profile } = useAuth();
  const [paying, setPaying] = useState(false);
  const due = Number(member.registration_fee_due || 0);
  const paid = Number(member.registration_fee_paid || 0);
  const remaining = Math.max(0, due - paid);
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
  const countdown = useCountdown(member.registration_deadline);

  const triggerStk = async () => {
    setPaying(true);
    try {
      const normalizedPhone = normalizePhone(profile?.phone || member.profiles?.phone || "");
      if (!normalizedPhone) {
        throw new Error("Your profile phone number is missing or invalid. Update your profile, then try again.");
      }

      const { data, error } = await supabase.functions.invoke("payment-stk-push", {
        body: {
          phone_number: normalizedPhone,
          amount: Math.ceil(remaining),
          account_reference: member.member_code,
          transaction_desc: "Welfare Reg",
          callback_metadata: {
            type: "welfare_contribution",
            welfare_id: welfare.id,
            member_id: member.id,
            recipient_member_code: member.member_code,
            user_id: user?.id,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("STK push sent — enter your M-Pesa PIN");
      setTimeout(onPaid, 8000);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send STK push. You can also pay via Paybill below.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="container px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-amber-500" />
          Complete registration to join {welfare.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          You will become an active member only after the registration fee is fully paid.
        </p>
        <Badge variant="outline" className="mt-2 border-amber-500 text-amber-700 dark:text-amber-400">
          Pending registration
        </Badge>
      </div>

      <Tabs defaultValue="pay" className="w-full">
        <TabsList className="w-full grid grid-cols-3 gap-2 mb-4">
          <TabsTrigger value="pay" className="font-bold">Pay</TabsTrigger>
          <TabsTrigger value="about" className="font-bold">About</TabsTrigger>
          <TabsTrigger value="documents" className="font-bold">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="pay">
          <Card className="border-amber-500/60 bg-amber-50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Pay registration fee
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Countdown */}
              {countdown && (
                <div className="rounded-lg border border-amber-500/40 p-3 bg-background">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Clock className="h-3.5 w-3.5" />
                    Deadline
                  </div>
                  {countdown.expired ? (
                    <p className="text-sm font-bold text-destructive">Deadline passed — you may be removed shortly.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { l: "Days", v: countdown.d },
                        { l: "Hrs", v: countdown.h },
                        { l: "Min", v: countdown.m },
                        { l: "Sec", v: countdown.s },
                      ].map((b) => (
                        <div key={b.l} className="rounded-md bg-amber-100 dark:bg-amber-900/30 py-2">
                          <p className="text-lg font-bold tabular-nums">{String(b.v).padStart(2, "0")}</p>
                          <p className="text-[10px] uppercase text-muted-foreground">{b.l}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-background p-2 border">
                  <p className="text-muted-foreground">Due</p>
                  <p className="font-bold text-base">KES {due.toLocaleString()}</p>
                </div>
                <div className="rounded-md bg-background p-2 border">
                  <p className="text-muted-foreground">Paid</p>
                  <p className="font-bold text-base">KES {paid.toLocaleString()}</p>
                </div>
                <div className="rounded-md bg-background p-2 border">
                  <p className="text-muted-foreground">Remaining</p>
                  <p className="font-bold text-base text-amber-700 dark:text-amber-400">
                    KES {remaining.toLocaleString()}
                  </p>
                </div>
              </div>
              {paid > 0 && (
                <Progress value={pct} className="h-2" />
              )}

              {/* Paybill instructions */}
              <div className="rounded-lg border bg-background p-3 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">M-Pesa Paybill</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Business no.</p>
                    <p className="font-mono font-bold text-lg">4015351</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copy("4015351", "Paybill")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Account no.</p>
                    <p className="font-mono font-bold text-lg">{member.member_code}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copy(member.member_code, "Account")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Amount</p>
                    <p className="font-mono font-bold text-lg">KES {remaining.toLocaleString()}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copy(String(remaining), "Amount")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <Button
                onClick={triggerStk}
                disabled={paying || remaining <= 0}
                className="w-full"
                size="lg"
              >
                {paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Pay KES {remaining.toLocaleString()} via M-Pesa
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                A 10% platform commission applies to the registration fee. Normal welfare
                contributions are charged 5%.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle>{welfare.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {welfare.description && (
                <p className="text-muted-foreground">{welfare.description}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Contribution</p>
                  <p className="font-bold">KES {Number(welfare.contribution_amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Registration fee</p>
                  <p className="font-bold">KES {Number(welfare.registration_fee || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Frequency</p>
                  <p className="font-bold capitalize">{welfare.contribution_frequency || "monthly"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Group code</p>
                  <p className="font-mono font-bold">{welfare.group_code || "—"}</p>
                </div>
              </div>
              {welfare.welfare_members?.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Executives</p>
                  <ul className="space-y-1 text-sm">
                    {welfare.welfare_members
                      .filter((m: any) => ["chairman", "secretary", "treasurer"].includes(m.role))
                      .map((m: any) => (
                        <li key={m.id} className="flex justify-between">
                          <span>{m.profiles?.full_name || "—"}</span>
                          <Badge variant="outline" className="capitalize">{m.role}</Badge>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <GroupDocuments
            entityType="welfare"
            entityId={welfare.id}
            canUpload={false}
            isManager={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
