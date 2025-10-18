
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Users, Link2, DollarSign, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ChamaInviteManager } from "@/components/ChamaInviteManager";
import { ChamaPendingRequests } from "@/components/ChamaPendingRequests";
import { ChamaPaymentForm } from "@/components/ChamaPaymentForm";

type Profile = {
  full_name?: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
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

export default function ChamaDetail() {
  const { id } = useParams();
  const [chama, setChama] = useState<Chama | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<ChamaMember[]>([]);
  const [currentCycle, setCurrentCycle] = useState<any | null>(null);
  const [paidMemberIds, setPaidMemberIds] = useState<Record<string, boolean>>({});
  const [totalCollected, setTotalCollected] = useState<number>(0);
  const [showPaymentModalFor, setShowPaymentModalFor] = useState<string | null>(null);
  const [currentUserMemberId, setCurrentUserMemberId] = useState<string | null>(null);
  const [nextReceiver, setNextReceiver] = useState<ChamaMember | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey]);

  const loadAll = async () => {
    setLoading(true);
    try {
      if (!id) throw new Error("Missing chama id/slug in route.");

      // Try server function first (chama-crud)
      try {
        const res = await supabase.functions.invoke("chama-crud", { body: { id } });
        if (res && !(res as any).error) {
          const payload = (res as any).data || (res as any);
          if (payload) {
            await applyChamaPayload(payload);
            return;
          }
        }
      } catch (e) {
        // fall back to direct query
      }

      const { data: chamaData, error: chamaErr } = await supabase
        .from("chama")
        .select("*")
        .or(`id.eq.${id},slug.eq.${id}`)
        .maybeSingle();
      if (chamaErr) throw chamaErr;
      if (!chamaData) {
        setChama(null);
        return;
      }

      const { data: membersData } = await supabase
        .from("chama_members")
        .select("id,user_id,member_code,order_index,approval_status,is_manager,joined_at,profiles(id,full_name,email,phone,avatar_url),balance_credit,balance_deficit,last_payment_date")
        .eq("chama_id", chamaData.id)
        .order("order_index", { ascending: true });
      const assembled = { ...chamaData, chama_members: membersData || [] };
      await applyChamaPayload(assembled);
    } catch (err: any) {
      console.error("Error loading chama:", err);
      toast({ title: "Error", description: err?.message || "Failed to load chama" });
    } finally {
      setLoading(false);
    }
  };

  const applyChamaPayload = async (payload: any) => {
    setChama(payload);
    const mems: ChamaMember[] = payload.chama_members || [];
    setMembers(mems);
    await detectCurrentUser(mems);
    await loadCycleAndPayments(payload.id, mems);
    await computeNextReceiver(payload.id, mems);
  };

  const detectCurrentUser = async (mems: ChamaMember[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const found = mems.find((m) => m.user_id === user.id);
        if (found) setCurrentUserMemberId(found.id);
      }
    } catch {
      // ignore
    }
  };

  const loadCycleAndPayments = async (chamaId: string, mems: ChamaMember[]) => {
    try {
      const now = new Date().toISOString();
      const { data: cycles } = await supabase
        .from("contribution_cycles")
        .select("*")
        .eq("chama_id", chamaId)
        .lte("start_date", now)
        .gte("end_date", now);
      let active = null;
      if (cycles && cycles.length) active = cycles[0];
      else {
        const { data: lastCycle } = await supabase
          .from("contribution_cycles")
          .select("*")
          .eq("chama_id", chamaId)
          .order("start_date", { ascending: false })
          .limit(1);
        active = lastCycle?.[0] ?? null;
      }
      setCurrentCycle(active);

      let contributions: any[] = [];
      if (active) {
        const { data } = await supabase
          .from("contributions")
          .select("member_id,amount,contribution_date,status")
          .eq("chama_id", chamaId)
          .gte("contribution_date", active.start_date)
          .lte("contribution_date", active.end_date);
        contributions = data || [];
      } else {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const { data } = await supabase
          .from("contributions")
          .select("member_id,amount,contribution_date,status")
          .eq("chama_id", chamaId)
          .gte("contribution_date", cutoff.toISOString())
          .order("contribution_date", { ascending: false })
          .limit(500);
        contributions = data || [];
      }

      const paidSet: Record<string, boolean> = {};
      let total = 0;
      for (const c of contributions) {
        paidSet[c.member_id] = true;
        total += parseFloat(c.amount || 0);
      }
      setPaidMemberIds(paidSet);
      setTotalCollected(total);
    } catch (err) {
      console.error("Error loading payments:", err);
    }
  };

  const computeNextReceiver = async (chamaId: string, mems: ChamaMember[]) => {
    try {
      if (!mems || mems.length === 0) {
        setNextReceiver(null);
        return;
      }
      let lastReceiverId: string | null = null;
      try {
        const { data: last } = await supabase
          .from("withdrawals")
          .select("member_id,created_at")
          .eq("chama_id", chamaId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (last && last.length) lastReceiverId = last[0].member_id;
      } catch { /* ignore */ }

      if (!lastReceiverId) {
        try {
          const { data: lastTx } = await supabase
            .from("transactions")
            .select("meta->>'withdrawal_member_id' as member_id, created_at")
            .eq("chama_id", chamaId)
            .eq("transaction_type", "payout")
            .order("created_at", { ascending: false })
            .limit(1);
          if (lastTx && lastTx.length && lastTx[0].member_id) lastReceiverId = lastTx[0].member_id;
        } catch { /* ignore */ }
      }

      const approved = mems.filter((m) => m.approval_status === "approved").sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      if (!approved.length) {
        setNextReceiver(null);
        return;
      }

      if (!lastReceiverId) {
        setNextReceiver(approved[0]);
        return;
      }

      const lastIndex = approved.findIndex((m) => m.id === lastReceiverId);
      if (lastIndex === -1) setNextReceiver(approved[0]);
      else setNextReceiver(approved[(lastIndex + 1) % approved.length]);
    } catch (err) {
      console.error("Error computing next receiver:", err);
    }
  };

  const paidCount = useMemo(() => Object.keys(paidMemberIds).length, [paidMemberIds]);
  const memberCount = members.length;

  const onPaymentSuccess = async () => {
    if (!chama) return;
    await loadCycleAndPayments(chama.id, members);
    await computeNextReceiver(chama.id, members);
    setShowPaymentModalFor(null);
    toast({ title: "Payment recorded" });
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto p-4">
          <Card>
            <CardContent className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto p-4">
          <Card>
            <CardContent>
              <p className="text-center text-muted-foreground">Chama not found.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const Hero = () => (
    <div className="bg-gradient-to-r from-white/50 to-slate-50 p-4 rounded-lg shadow-sm">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="flex items-center space-x-4 col-span-2">
          <div className="p-3 rounded-full bg-slate-100 border">
            <Users className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{chama.name}</h1>
            <p className="text-sm text-muted-foreground">{chama.description || "No description provided"}</p>
            <div className="mt-2 flex items-center gap-3">
              <Badge>Contribution: KES {Number(chama.contribution_amount || 0).toLocaleString()}</Badge>
              <Badge variant="secondary">{chama.contribution_frequency || "frequency not set"}</Badge>
              <Badge variant="outline">{memberCount} members</Badge>
            </div>
          </div>
        </div>

        <div className="col-span-1">
          <div className="bg-white p-3 rounded border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total collected</p>
                <p className="text-lg font-semibold">KES {Number(totalCollected || 0).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Next receiver</p>
                {nextReceiver ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{(nextReceiver.profiles?.full_name || "U").slice(0,1)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{nextReceiver.profiles?.full_name || nextReceiver.member_code}</p>
                      <p className="text-xs text-muted-foreground">Order #{nextReceiver.order_index}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">No receiver set</p>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="ghost" onClick={refresh}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </Button>
              <Button size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/chama/join/${chama.slug}`)}>
                <Link2 className="h-4 w-4 mr-2" /> Copy Invite
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <Hero />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>
                  See who has paid for the current cycle and make payments on behalf of others.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  <div className="divide-y rounded">
                    {members.map((m) => {
                      const paid = Boolean(paidMemberIds[m.id]);
                      return (
                        <div key={m.id} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>{(m.profiles?.full_name || m.member_code || "U").slice(0,1)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{m.profiles?.full_name || m.member_code}</p>
                              <p className="text-xs text-muted-foreground">{m.profiles?.email || m.profiles?.phone}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div>
                              {m.is_manager && <Badge variant="secondary">Manager</Badge>}
                            </div>

                            <div>
                              {paid ? <Badge>Paid</Badge> : <Badge variant="destructive">Not paid</Badge>}
                            </div>

                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => setShowPaymentModalFor(m.id)}>
                                <DollarSign className="h-4 w-4 mr-2" /> Pay
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cycle & Payment summary</CardTitle>
                <CardDescription>
                  {currentCycle ? `Cycle: ${new Date(currentCycle.start_date).toLocaleDateString()} — ${new Date(currentCycle.end_date).toLocaleDateString()}` : "No active cycle found"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Members paid</p>
                    <p className="font-medium text-lg">{paidCount} / {memberCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contribution amount</p>
                    <p className="font-medium text-lg">KES {Number(chama.contribution_amount || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">Total this cycle</p>
                  <p className="font-semibold">KES {Number(totalCollected || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Invite & Quick Actions</CardTitle>
                <CardDescription>Share invite link, view pending requests, manager actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2">
                  <div className="text-sm">
                    <Label className="text-muted-foreground">Invite link</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <Input readOnly value={`${window.location.origin}/chama/join/${chama.slug}`} />
                      <Button size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/chama/join/${chama.slug}`)}>Copy</Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Anyone with the link can request to join — manager approval required.</p>
                  </div>

                  <div className="pt-2">
                    <ChamaInviteManager chamaId={chama.id} chamaSlug={chama.slug} isManager={true} />
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Pending requests</Label>
                    <div className="mt-2">
                      <ChamaPendingRequests chamaId={chama.id} isManager={true} onUpdate={() => refresh()} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer overview</CardTitle>
                <CardDescription>Key metrics customers want to see</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="font-medium">{memberCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid this cycle</p>
                      <p className="font-medium">{paidCount}</p>
                    </div>
