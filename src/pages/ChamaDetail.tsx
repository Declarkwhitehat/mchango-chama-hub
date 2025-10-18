import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, Link2, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { ChamaInviteManager } from "@/components/ChamaInviteManager";
import { ChamaPaymentForm } from "@/components/ChamaPaymentForm";
import { ChamaPendingRequests } from "@/components/ChamaPendingRequests";

export default function ChamaDetail() {
  const { id } = useParams();
  const [chama, setChama] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModalFor, setShowPaymentModalFor] = useState<string | null>(null);
  const [nextReceiver, setNextReceiver] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [totalCollected, setTotalCollected] = useState<number>(0);

  useEffect(() => {
    loadChama();
    loadUser();
  }, [id]);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function loadChama() {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("chamas")
      .select("*, members(*, profiles(full_name, email)), contributions(*)")
      .eq("id", id)
      .single();

    if (error) console.error(error);
    else {
      setChama(data);
      setMembers(data.members || []);
      calculateTotal(data.contributions || []);
      determineNextReceiver(data);
    }
    setLoading(false);
  }

  function calculateTotal(contributions: any[]) {
    const sum = contributions.reduce((acc, c) => acc + (c.amount || 0), 0);
    setTotalCollected(sum);
  }

  function determineNextReceiver(chamaData: any) {
    if (!chamaData.members?.length) return;
    const unpaidMembers = chamaData.members.filter((m: any) => !m.has_paid);
    setNextReceiver(unpaidMembers.length ? unpaidMembers[0] : chamaData.members[0]);
  }

  function onPaymentSuccess() {
    loadChama();
    setShowPaymentModalFor(null);
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <div className="text-center text-gray-500 py-12">
          <p>Chama not found.</p>
        </div>
      </Layout>
    );
  }

  const paidCount = members.filter((m) => m.has_paid).length;
  const totalMembers = members.length;

  return (
    <Layout>
      {/* Header Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{chama.name}</h1>
        <p className="text-sm text-muted-foreground">{chama.description}</p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Overview */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span>Total Members</span>
                </div>
                <p className="font-semibold">{totalMembers}</p>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Paid</span>
                </div>
                <p className="font-semibold">{paidCount}</p>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <span>Next Receiver</span>
                </div>
                <p className="font-semibold">
                  {nextReceiver?.profiles?.full_name || nextReceiver?.member_code || "TBD"}
                </p>
              </div>
              <div className="flex justify-between items-center">
                <span>Total Collected</span>
                <p className="font-semibold">KES {Number(totalCollected).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Invite & Pending Requests */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Invite Members</CardTitle>
            </CardHeader>
            <CardContent>
              <ChamaInviteManager chamaId={chama.id} inviteLink={chama.invite_link} />
              <div className="mt-6">
                <ChamaPendingRequests chamaId={chama.id} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Members & Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-600">
                      <th className="py-2 text-left">Name</th>
                      <th className="py-2 text-left">Email</th>
                      <th className="py-2 text-left">Status</th>
                      <th className="py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-b last:border-none">
                        <td className="py-2">{member.profiles?.full_name || "—"}</td>
                        <td className="py-2 text-gray-500">{member.profiles?.email || "—"}</td>
                        <td className="py-2">
                          {member.has_paid ? (
                            <span className="text-green-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Paid
                            </span>
                          ) : (
                            <span className="text-red-500 font-medium flex items-center gap-1">
                              <Clock className="w-4 h-4" /> Unpaid
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          {!member.has_paid && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowPaymentModalFor(member.id)}
                              >
                                Pay Self
                              </Button>
                              {user?.id === chama.manager_id && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setShowPaymentModalFor(member.id)}
                                >
                                  Pay for Member
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModalFor && (
        <ChamaPaymentForm
          chamaId={chama.id}
          memberId={showPaymentModalFor}
          onSuccess={onPaymentSuccess}
          onCancel={() => setShowPaymentModalFor(null)}
        />
      )}
    </Layout>
  );
      }
