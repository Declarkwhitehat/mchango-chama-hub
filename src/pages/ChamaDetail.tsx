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

      const { data: chamaData, error: chamaErr } = await supabase
        .from("chamas")
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
        .select(`
          id,
          user_id,
          member_code,
          order_index,
          approval_status,
          is_manager,
          joined_at,
          profiles(id, full_name, email, phone, avatar_url),
          balance_credit,
          balance_deficit,
          last_payment_date
        `)
        .eq("chama_id", chamaData.id)
        .order("order_index", { ascending: true });

      const fullChama = { ...chamaData, chama_members: membersData || [] };
      setChama(fullChama);
      setMembers(membersData || []);

      await loadCycleAndPayments(chamaData.id, membersData || []);
      await computeNextReceiver(chamaData.id, membersData || []);
    } catch (err: any) {
      console.error("Error loading chama:", err);
      toast({
        title: "Error loading chama",
        description: err?.message || "Unable to load chama details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
      setCurrentCycle(active);

      let contributions: any[] = [];
      if (active) {
        const { data } = await supabase
          .from("contributions")
          .select("member_id,amount")
          .eq("chama_id", chamaId)
          .gte("contribution_date", active.start_date)
          .lte("contribution_date", active.end_date);
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
      console.error("Error loading cycle/payments:", err);
    }
  };

  const computeNextReceiver = async (chamaId: string, mems: ChamaMember[]) => {
    const approved = mems
      .filter((m) => m.approval_status === "approved")
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    if (!approved.length) {
      setNextReceiver(null);
      return;
    }

    const { data: last } = await supabase
      .from("withdrawals")
      .select("member_id")
      .eq("chama_id", chamaId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!last?.length) {
      setNextReceiver(approved[0]);
      return;
    }

    const lastIndex = approved.findIndex((m) => m.id === last[0].member_id);
    setNextReceiver(approved[(lastIndex + 1) % approved.length]);
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const paidCount = useMemo(() => Object.keys(paidMemberIds).length, [paidMemberIds]);
  const memberCount = members.length;

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto py-10">
          <Card>
            <CardContent className="text-center py-10">
              <p className="text-muted-foreground">No chama details found.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Hero section */}
        <div className="bg-gradient-to-r from-slate-50 to-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{chama.name}</h1>
              <p className="text-sm text-muted-foreground">{chama.description}</p>
              <div className="flex gap-2 mt-2">
                <Badge>Contribution: KES {chama.contribution_amount}</Badge>
                <Badge variant="secondary">{chama.contribution_frequency}</Badge>
                <Badge variant="outline">{members.length} members</Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total collected</p>
              <p className="text-lg font-bold">
                KES {Number(totalCollected || 0).toLocaleString()}
              </p>
              {nextReceiver && (
                <div className="mt-2 text-sm">
                  <p className="text-xs text-muted-foreground">Next receiver:</p>
                  <p>{nextReceiver.profiles?.full_name || nextReceiver.member_code}</p>
                </div>
              )}
              <Button
                size="sm"
                className="mt-2"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${window.location.origin}/chama/join/${chama.slug}`
                  )
                }
              >
                <Link2 className="h-4 w-4 mr-1" /> Copy Invite Link
              </Button>
            </div>
          </div>
        </div>

        {/* Members section */}
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              See who has paid for the current cycle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <div className="divide-y rounded">
                {members.map((m) => {
                  const paid = paidMemberIds[m.id];
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {(m.profiles?.full_name || "U").slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{m.profiles?.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.profiles?.email || m.profiles?.phone}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.is_manager && <Badge variant="secondary">Manager</Badge>}
                        {paid ? (
                          <Badge>Paid</Badge>
                        ) : (
                          <Badge variant="destructive">Not Paid</Badge>
                        )}
                        <Button
                          size="sm"
                          onClick={() => setShowPaymentModalFor(m.id)}
                        >
                          <DollarSign className="h-4 w-4 mr-2" /> Pay
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invite & Pending Requests */}
        <Card>
          <CardHeader>
            <CardTitle>Invite & Requests</CardTitle>
            <CardDescription>Manage invites and requests</CardDescription>
          </CardHeader>
          <CardContent>
            <ChamaInviteManager chamaId={chama.id} chamaSlug={chama.slug} isManager />
            <div className="mt-4">
              <ChamaPendingRequests chamaId={chama.id} isManager onUpdate={refresh} />
            </div>
          </CardContent>
        </Card>
      </div>

      {showPaymentModalFor && (
        <ChamaPaymentForm
          chamaId={chama.id}
          memberId={showPaymentModalFor}
          onSuccess={() => {
            setShowPaymentModalFor(null);
            refresh();
          }}
          onCancel={() => setShowPaymentModalFor(null)}
        />
      )}
    </Layout>
  );
  }
