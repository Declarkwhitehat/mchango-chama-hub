import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, TrendingUp, UserPlus } from "lucide-react";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type ChamaMember = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  is_manager?: boolean;
};

type Transaction = {
  id: string;
  description?: string | null;
  amount: number;
  created_at?: string | null;
  member_name?: string | null;
};

type Chama = {
  id: string;
  name: string;
  description?: string | null;
  is_private?: boolean;
  created_at?: string | null;
  chama_members?: ChamaMember[];
  transactions?: Transaction[];
};

const ChamaDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [chama, setChama] = useState<Chama | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        // Example fetch: adjust select and relationships to match your DB schema
        // We expect a chama table with related chama_members and transactions
        const { data, error } = await supabase
          .from("chama")
          .select(
            `id, name, description, is_private, created_at,
             chama_members ( id, name, phone, email, avatar_url, is_manager ),
             transactions ( id, description, amount, created_at, member_name )`
          )
          .eq("id", id)
          .single();

        if (error && error.code !== "PGRST116") {
          // PGRST116 sometimes occurs when .single() finds nothing - treat as not found
          throw error;
        }

        if (!data) {
          setChama(null);
        } else {
          setChama(data as Chama);
        }
      } catch (err: any) {
        console.error("Fetch chama error:", err);
        toast({
          title: "Failed to load chama",
          description: err?.message || String(err),
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="container px-4 py-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <Loader2 className="animate-spin" />
            <span>Loading chama...</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <div className="container px-4 py-6 max-w-4xl mx-auto">
          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold">Chama not found</h3>
              <p>We couldn't find that chama. It may be private or removed.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Render the chama details (based on the older working UI)
  return (
    <Layout>
      <div className="container px-4 py-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{chama.name}</h1>
          {chama.description && <p className="text-sm text-muted-foreground">{chama.description}</p>}
        </div>

        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members">
              <Users className="mr-2 h-4 w-4" /> Members
            </TabsTrigger>
            <TabsTrigger value="contributions">
              <UserPlus className="mr-2 h-4 w-4" /> Contributions
            </TabsTrigger>
            <TabsTrigger value="activity">
              <TrendingUp className="mr-2 h-4 w-4" /> Activity
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <Calendar className="mr-2 h-4 w-4" /> Calendar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <div className="grid gap-4">
              {chama.chama_members && chama.chama_members.length > 0 ? (
                chama.chama_members.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          {m.avatar_url ? <img src={m.avatar_url} alt={m.name} /> : <AvatarFallback>{m.name?.[0] ?? "?"}</AvatarFallback>}
                        </Avatar>
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-sm text-muted-foreground">{m.email || m.phone || ""}</div>
                        </div>
                      </div>
                      <div>{m.is_manager && <Badge variant="secondary">Manager</Badge>}</div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div>No members yet.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contributions">
            <Card>
              <CardContent>
                <h3 className="text-lg font-semibold mb-2">Contributions</h3>
                {chama.transactions && chama.transactions.length > 0 ? (
                  <div className="space-y-3">
                    {chama.transactions.map((t) => (
                      <div key={t.id} className="flex justify-between">
                        <div>
                          <div className="font-medium">{t.description || "Contribution"}</div>
                          <div className="text-sm text-muted-foreground">{t.member_name}</div>
                        </div>
                        <div>
                          <span className="font-semibold">
                            {t.amount > 0 ? "+" : ""}KES {Math.abs(t.amount).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>No contributions yet.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardContent>
                <h3 className="text-lg font-semibold mb-2">Recent Activity</h3>
                <div>{/* You can wire real activity here later */}No recent activity.</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar">
            <Card>
              <CardContent>
                <h3 className="text-lg font-semibold">Calendar</h3>
                <p className="text-sm text-muted-foreground">Upcoming meetings and events will show here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default ChamaDetail;
