import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChamaInviteManager } from "@/components/ChamaInviteManager";
import { ChamaPaymentForm } from "@/components/ChamaPaymentForm";
import { ChamaPendingRequests } from "@/components/ChamaPendingRequests";

type Profile = {
  full_name?: string;
  email?: string;
  phone?: string;
};

type ChamaMember = {
  id: string;
  user_id: string;
  member_code?: string;
  order_index?: number;
  profiles?: Profile;
  approval_status?: string;
  is_manager?: boolean;
  joined_at?: string;
  balance_credit?: number;
  balance_deficit?: number;
  last_payment_date?: string | null;
};

type Chama = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  contribution_amount?: number;
  contribution_frequency?: string;
  commission_rate?: number;
  chama_members?: ChamaMember[];
  profiles?: Profile;
};

const ChamaDetail: React.FC = () => {
  const { id } = useParams(); // slug or id
  const [chama, setChama] = useState<Chama | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCycle, setCurrentCycle] = useState<any>(null);
  const [paidMemberIds, setPaidMemberIds] = useState<Record<string, boolean>>({});
  const [showPaymentForMember, setShowPaymentForMember] = useState<string | null>(null);
  const [currentUserMemberId, setCurrentUserMemberId] = useState<string | null>(null);
  const [nextReceiverMember, setNextReceiverMember] = useState<ChamaMember | null>(null);

  useEffect(() => {
    loadChama();
  }, [id]);

  const loadChama = async () => {
    setLoading(true);
    try {
      if (!id) throw new Error("Missing chama id/slug in route.");

      // Try the chama-crud function (returns chama with members and useful data)
      try {
        const res = await supabase.functions.invoke("chama-crud", {
          body: { id },
        });

        if (!res || (res as any).error) {
          console.warn("chama-crud returned error or empty, falling back to direct query", res);
        } else {
          const payload = (res as any).data || (res as any);
          if (payload) {
            setChama(payload);
            // fetch cycle + payments after setting chama
            await loadCurrentCycleAndPayments(payload.id, payload.chama_members || []);
            await detectCurrentUserMember(payload.chama_members || []);
            await computeNextReceiver(payload.chama_members || []);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("chama-crud invoke failed:", err);
      }

      // Fallback: direct query by slug
      const { data: bySlug, error: errBySlug } = await supabase
        .from("chama")
        .select(`
          *,
          profiles:created_by ( full_name, email, phone )
        `)
        .eq("slug", id)
        .maybeSingle();

      if (errBySlug) console.warn("Direct query by slug error:", errBySlug);
      if (bySlug) {
        // fetch members attached separately (ordered)
        const { data: members } = await supabase
          .from("chama_members")
          .select("id,user_id,member_code,order_index,approval_status,is_manager,joined_at,profiles(id,full_name,email,phone),balance_credit,balance_deficit,last_payment_date")
          .eq("chama_id", bySlug.id)
          .order("order_index", { ascending: true });

        const assembled = { ...bySlug, chama_members: members || [] };
        setChama(assembled as any);
        await loadCurrentCycleAndPayments(assembled.id, assembled.chama_members || []);
        await detectCurrentUserMember(assembled.chama_members || []);
        await computeNextReceiver(assembled.chama_members || []);
      }

    } catch (error: any) {
      console.error("Error loading chama detail", error);
      toast({ title: "Error", description: error.message || "Failed to load chama" });
    } finally {
      setLoading(false);
    }
  };

  const detectCurrentUserMember = async (members: ChamaMember[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const found = members.find(m => m.user_id === user.id);
        if (found) setCurrentUserMemberId(found.id);
      }
    } catch (e) {
      console.warn("Could not detect current user membership", e);
    }
  };

  const loadCurrentCycleAndPayments = async (chamaId: string, members: ChamaMember[]) => {
    try {
      // 1) Find the active/current contribution cycle for this chama
      const { data: cycles, error: cycleErr } = await supabase
        .from("contribution_cycles")
        .select("*")
        .eq("chama_id", chamaId)
        .lte("start_date", new Date().toISOString())
        .gte("end_date", new Date().toISOString()); // try to find a cycle that contains now

      let activeCycle = null;
      if (cycleErr) {
        console.warn("Error fetching contribution_cycles:", cycleErr);
      }
      if (cycles && cycles.length) {
        activeCycle = cycles[0];
      } else {
        // fallback: load latest cycle (last one)
        const { data: lastCycles } = await supabase
          .from("contribution_cycles")
          .select("*")
          .eq("chama_id", chamaId)
          .order("start_date", { ascending: false })
          .limit(1);
        activeCycle = lastCycles?.[0] ?? null;
      }
      setCurrentCycle(activeCycle);

      // 2) If we have an active cycle, fetch contributions within that cycle to determine who has paid
      let paidSet: Record<string, boolean> = {};
      if (activeCycle) {
        const { data: contributions } = await supabase
          .from("contributions")
          .select("member_id,amount,contribution_date,status")
          .eq("chama_id", chamaId)
          .gte("contribution_date", activeCycle.start_date)
          .lte("contribution_date", activeCycle.end_date);

        if (contributions && contributions.length) {
          for (const c of contributions) {
            paidSet[c.member_id] = true;
          }
        }
      } else {
        // If cycles are not present, fall back to checking contributions in the last 30 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const { data: contributions } = await supabase
          .from("contributions")
          .select("member_id,amount,contribution_date,status")
          .eq("chama_id", chamaId)
          .gte("contribution_date", cutoff.toISOString())
          .order("contribution_date", { ascending: false })
          .limit(500);

        if (contributions && contributions.length) {
          // pick the most recent contribution_date and mark payers within that date as paid
          const latestDate = contributions[0].contribution_date;
          for (const c of contributions) {
            if (c.contribution_date === latestDate) paidSet[c.member_id] = true;
          }
        }
      }

      setPaidMemberIds(paidSet);

    } catch (err) {
      console.error("Error loading cycle/payments", err);
    }
  };

  const computeNextReceiver = async (members: ChamaMember[]) => {
    try {
      if (!members || !members.length) {
        setNextReceiverMember(null);
        return;
      }

      // Attempt to find last withdrawal/payout recorded (withdrawals table or transactions)
      // We'll try to read the last completed withdrawal with a receiver (withdrawals table)
      let lastReceiverMemberId: string | null = null;
      try {
        const { data: lastWithdrawals } = await supabase
          .from("withdrawals")
          .select("member_id,created_at")
          .eq("chama_id", chama?.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (lastWithdrawals && lastWithdrawals.length) {
          lastReceiverMemberId = lastWithdrawals[0].member_id;
        }
      } catch (e) {
        console.debug("withdrawals table query failed (maybe different table name):", e);
      }

      // If we could not find a last receiver from withdrawals, fall back to using the last payout transaction
      if (!lastReceiverMemberId) {
        try {
          const { data: lastPayout } = await supabase
            .from("transactions")
            .select("meta->>'withdrawal_member_id' as member_id, created_at")
            .eq("chama_id", chama?.id)
            .eq("transaction_type", "payout")
            .order("created_at", { ascending: false })
            .limit(1);
          if (lastPayout && lastPayout.length && lastPayout[0].member_id) {
            lastReceiverMemberId = lastPayout[0].member_id;
          }
        } catch (e) {
          // ignore
        }
      }

      // If still not found, assume rotation starts at the smallest order_index
      let nextMember: ChamaMember | null = null;
      const approvedMembers = members.filter(m => m.approval_status === "approved").sort((a,b)=> (a.order_index||0)-(b.order_index||0));
      if (!approvedMembers.length) {
        setNextReceiverMember(null);
        return;
      }

      if (!lastReceiverMemberId) {
        nextMember = approvedMembers[0];
      } else {
        const last = approvedMembers.find(m => m.id === lastReceiverMemberId);
        if (!last) {
          nextMember = approvedMembers[0];
        } else {
          const idx = approvedMembers.indexOf(last);
          const nextIdx = (idx + 1) % approvedMembers.length;
          nextMember = approvedMembers[nextIdx];
        }
      }

      setNextReceiverMember(nextMember ?? null);
    } catch (err) {
      console.error("Error computing next receiver", err);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </CardContent>
        </Card>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <Card>
          <CardContent>
            <p>Chama not found.</p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  const members = chama.chama_members || [];
  const manager = members.find(m => m.is_manager);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{chama.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm">{chama.description}</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Contribution</Label>
                    <p className="font-medium">KES {Number(chama.contribution_amount || 0).toLocaleString()}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Frequency</Label>
                    <p className="font-medium">{chama.contribution_frequency}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Members</Label>
                    <p className="font-medium">{members.length}</p>
                  </div>
                </div>

                {nextReceiverMember && (
                  <div className="mt-4 p-3 border rounded">
                    <Label className="text-muted-foreground">Next receiver</Label>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <p className="font-medium">{nextReceiverMember.profiles?.full_name || nextReceiverMember.member_code}</p>
                        <p className="text-xs text-muted-foreground">Order #{nextReceiverMember.order_index}</p>
                      </div>
                      <div>
                        <Badge variant="secondary">Upcoming</Badge>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <Label className="text-muted-foreground">Manager tools</Label>
                  <div className="mt-2 space-y-2">
                    {manager && (
                      <ChamaInviteManager chamaId={chama.id} chamaSlug={chama.slug} isManager={true} />
                    )}
                    <ChamaPendingRequests chamaId={chama.id} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4">
              {members.length === 0 ? (
                <Card>
                  <CardContent>No members yet</CardContent>
                </Card>
              ) : members.map(m => (
                <Card key={m.id}>
                  <CardContent className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarFallback>{(m.profiles?.full_name || "U").slice(0,1)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{m.profiles?.full_name || m.member_code}</p>
                        <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                        <p className="text-xs text-muted-foreground">Order #{m.order_index}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div>
                        {m.is_manager && <Badge variant="secondary">Manager</Badge>}
                      </div>

                      <div>
                        {paidMemberIds[m.id] ? (
                          <Badge>Paid</Badge>
                        ) : (
                          <Badge variant="destructive">Not paid</Badge>
                        )}
                      </div>

                      <div>
                        <Button size="sm" onClick={() => setShowPaymentForMember(m.id)}>Pay</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Invite link</Label>
                  <div className="mt-2">
                    <p className="text-sm">{`${window.location.origin}/chama/join/${chama.slug}`}</p>
                    <p className="text-xs text-muted-foreground">Anyone with this link can request to join (manager approval required).</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground">Payments</Label>
                  <p className="text-sm">Use the pay buttons on member cards to pay for yourself or another member.</p>
                </div>

                <div>
                  <Label className="text-muted-foreground">Members</Label>
                  <p className="text-sm">{members.length} total</p>
                </div>

              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current cycle</CardTitle>
              </CardHeader>
              <CardContent>
                {currentCycle ? (
                  <>
                    <p className="text-sm">Cycle: {new Date(currentCycle.start_date).toLocaleDateString()} — {new Date(currentCycle.end_date).toLocaleDateString()}</p>
                    <p className="text-sm mt-2">Paid: {Object.keys(paidMemberIds).length} / {members.length}</p>
                  </>
                ) : (
                  <p className="text-sm">No active cycle found</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {showPaymentForMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Make a payment</h3>
              <Button variant="ghost" onClick={() => setShowPaymentForMember(null)}>Close</Button>
            </div>
            <ChamaPaymentForm
              chamaId={chama.id}
              currentMemberId={currentUserMemberId}
              defaultTargetMemberId={showPaymentForMember}
              onSuccess={async () => {
                toast({ title: "Payment recorded" });
                setShowPaymentForMember(null);
                // reload payments to update UI
                await loadCurrentCycleAndPayments(chama.id, members);
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ChamaDetail;
