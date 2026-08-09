import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

const AdminWelfareDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [welfare, setWelfare] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [contribs, setContribs] = useState<any[]>([]);
  const [nok, setNok] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [w, m, c, ct, nk] = await Promise.all([
          supabase.from("welfares").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("welfare_members")
            .select("id, member_code, role, status, joined_at, total_contributed, registration_fee_paid, registration_status, user_id, profiles:user_id(full_name, phone)")
            .eq("welfare_id", id)
            .order("member_code"),
          supabase
            .from("welfare_contribution_cycles")
            .select("id, amount, start_date, status")
            .eq("welfare_id", id)
            .order("start_date"),
          supabase
            .from("welfare_contributions")
            .select("id, member_id, gross_amount, payment_status, category")
            .eq("welfare_id", id)
            .eq("payment_status", "completed")
            .neq("category", "registration_fee"),
          supabase
            .from("welfare_next_of_kin")
            .select("*")
            .eq("welfare_id", id),
        ]);
        if (w.error) throw w.error;
        setWelfare(w.data);
        setMembers(m.data || []);
        setCycles(c.data || []);
        setContribs(ct.data || []);
        setNok(nk.data || []);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load welfare");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const rows = useMemo(() => {
    if (!welfare) return [];
    const regFee = Number(welfare.registration_fee || 0);
    return members.map((m) => {
      const joined = m.joined_at ? new Date(m.joined_at) : null;
      // Only bill cycles that actually started AFTER (or on) the member joined.
      // If the manager hasn't opened a new cycle, expected = registration fee only.
      const eligibleCycles = cycles.filter((c) => {
        if (!joined) return true;
        return new Date(c.start_date) >= new Date(joined.toDateString());
      });
      const cyclesRequired = eligibleCycles.reduce((s, c) => s + Number(c.amount || 0), 0);
      const expected = regFee + cyclesRequired;

      const memberContribs = contribs.filter((x) => x.member_id === m.id);
      const paidFromContribs = memberContribs.reduce((s, x) => s + Number(x.gross_amount || 0), 0);
      const paid = paidFromContribs > 0 ? paidFromContribs : Number(m.total_contributed || 0);

      const pct = expected > 0
        ? (paid >= expected ? 100 : Math.round((paid / expected) * 100))
        : (paid > 0 ? 100 : 0);
      const overpaid = expected > 0 && paid > expected ? paid - expected : 0;

      return {
        ...m,
        name: m.profiles?.full_name || "Unknown",
        phone: m.profiles?.phone || "",
        paid,
        expected,
        pct,
        overpaid,
      };
    });
  }, [members, cycles, contribs, welfare]);


  const filtered = rows.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.member_code?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        </div>
      </AdminLayout>
    );
  }

  if (!welfare) {
    return (
      <AdminLayout>
        <div className="container px-4 py-6 max-w-5xl mx-auto">
          <p className="text-muted-foreground">Welfare not found.</p>
          <Button variant="outline" onClick={() => navigate("/admin/welfares")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/welfares")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{welfare.name}</h1>
            <p className="text-xs text-muted-foreground font-mono">{welfare.group_code}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Members</p><p className="text-xl font-bold">{members.filter((m) => m.status === "active" && (!m.registration_status || m.registration_status === "confirmed")).length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Registration Fee</p><p className="text-xl font-bold">KES {Number(welfare.registration_fee || 0).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Cycle Amount</p><p className="text-xl font-bold">KES {Number(welfare.contribution_amount || 0).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Balance</p><p className="text-xl font-bold">KES {Number(welfare.available_balance || 0).toLocaleString()}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members"><Users className="h-4 w-4 mr-2" />Members</TabsTrigger>
            <TabsTrigger value="nok"><ShieldCheck className="h-4 w-4 mr-2" />Next of Kin</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Member Contribution Progress</CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, member ID, or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead className="w-[220px]">%</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="text-sm font-medium">{r.name}</p>
                            <p className="text-xs text-muted-foreground">{r.phone}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.member_code}</TableCell>
                          <TableCell className="text-sm">
                            KES {r.paid.toLocaleString()}
                            {r.overpaid > 0 && (
                              <Badge variant="outline" className="ml-2 text-green-700 border-green-500 text-[10px]">
                                +{r.overpaid.toLocaleString()} credit
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">KES {r.expected.toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={r.pct} className="h-2 flex-1" />
                              <span className="text-xs font-medium w-10 text-right">{r.pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-xs capitalize">
                              {r.status}
                            </Badge>
                          </TableCell>

                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                            No members found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nok">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Next of Kin Records</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Confidential — visible to platform administrators only. {nok.length} of {members.length} members have submitted.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Member ID</TableHead>
                        <TableHead>Next of Kin</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>DOB</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Submitted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => {
                        const k = nok.find((n) => n.user_id === r.user_id);
                        return (
                          <TableRow key={`nok-${r.id}`}>
                            <TableCell className="text-sm font-medium">{r.name}</TableCell>
                            <TableCell className="font-mono text-xs">{r.member_code}</TableCell>
                            {k ? (
                              <>
                                <TableCell className="text-sm">{k.full_name}</TableCell>
                                <TableCell className="text-xs font-mono">{k.phone}</TableCell>
                                <TableCell className="text-xs">{new Date(k.date_of_birth).toLocaleDateString("en-GB")}</TableCell>
                                <TableCell className="text-xs">{k.relationship === "Other" ? k.relationship_other || "Other" : k.relationship}</TableCell>
                                <TableCell className="text-xs capitalize">{k.gender}</TableCell>
                                <TableCell className="text-xs">{new Date(k.updated_at).toLocaleDateString("en-GB")}</TableCell>
                              </>
                            ) : (
                              <TableCell colSpan={6}>
                                <Badge variant="secondary" className="text-[10px]">Not submitted</Badge>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                            No members found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminWelfareDetail;
