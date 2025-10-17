import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// Layout is a named export in your project; import it as such
import { Layout } from "@/components/Layout";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Profile = {
  full_name?: string;
  email?: string;
  phone?: string;
};

type ChamaMember = {
  id: string;
  user_id: string;
  member_code?: string;
  is_manager?: boolean;
  joined_at?: string;
  status?: string;
  approval_status?: string;
  order_index?: number;
  profiles?: Profile;
};

type ChamaData = {
  id: string;
  slug?: string;
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  contribution_amount?: number;
  contribution_frequency?: string;
  created_at?: string;
  created_by?: Profile;
  chama_members?: ChamaMember[];
  [key: string]: any;
};

const ChamaDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [chama, setChama] = useState<ChamaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserMembership, setCurrentUserMembership] = useState<ChamaMember | null>(null);

  useEffect(() => {
    loadChama();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadChama = async () => {
    setIsLoading(true);
    try {
      if (!id) {
        throw new Error("Missing chama id/slug in route.");
      }

      // Try server function first (pass id in body)
      try {
        const res = await supabase.functions.invoke("chama-crud", {
          body: { id },
        });

        console.log("chama-crud invoke response:", res);

        if (res?.error) {
          const apiError = (res.data as any)?.error || (res.data as any)?.message || res.error.message;
          throw new Error(apiError || "Server function error");
        }

        const returned = (res.data as any)?.data ?? res.data;
        if (returned) {
          setChama(returned);
          const { data: { user } } = await supabase.auth.getUser();
          if (user && returned.chama_members) {
            const membership = returned.chama_members.find((m: any) => m.user_id === user.id);
            setCurrentUserMembership(membership ?? null);
          }
          return;
        }
      } catch (fnErr) {
        console.warn("chama-crud function failed, will fallback to direct queries. Error:", fnErr);
      }

      // Fallback: direct supabase query by id
      const { data: byId, error: errById } = await supabase
        .from("chama")
        .select(`
          *,
          profiles:created_by ( full_name, email, phone ),
          chama_members ( id, user_id, member_code, is_manager, joined_at, status, approval_status, order_index, profiles ( full_name, email ) )
        `)
        .eq("id", id)
        .maybeSingle();

      if (errById) console.warn("Direct query by id error:", errById);
      if (byId) {
        setChama(byId);
        const { data: { user } } = await supabase.auth.getUser();
        if (user && byId.chama_members) {
          const membership = byId.chama_members.find((m: any) => m.user_id === user.id);
          setCurrentUserMembership(membership ?? null);
        }
        return;
      }

      // Fallback 2: direct query by slug
      const { data: bySlug, error: errBySlug } = await supabase
        .from("chama")
        .select(`
          *,
          profiles:created_by ( full_name, email, phone ),
          chama_members ( id, user_id, member_code, is_manager, joined_at, status, approval_status, order_index, profiles ( full_name, email ) )
        `)
        .eq("slug", id)
        .maybeSingle();

      if (errBySlug) console.warn("Direct query by slug error:", errBySlug);
      if (bySlug) {
        setChama(bySlug);
        const { data: { user } } = await supabase.auth.getUser();
        if (user && bySlug.chama_members) {
          const membership = bySlug.chama_members.find((m: any) => m.user_id === user.id);
          setCurrentUserMembership(membership ?? null);
        }
        return;
      }

      throw new Error("Chama not found");
    } catch (err: any) {
      console.error("Failed to load chama details:", err);
      toast({
        title: "Failed to load chama details",
        description: err.message || "Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container px-4 py-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin mr-2" />
            Loading...
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
              <p>We couldn't find the chama. It might be private or removed.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarFallback>{(chama.created_by?.full_name || "C").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{chama.title ?? chama.name}</div>
                <div className="text-sm text-muted-foreground">{chama.created_at}</div>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">{chama.description}</p>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-lg font-semibold mb-3">Members</h3>
          <div className="grid grid-cols-1 gap-3">
            {chama.chama_members?.map((m: ChamaMember) => (
              <Card key={m.id}>
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{(m.profiles?.full_name || m.user_id).slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{m.profiles?.full_name || m.user_id}</div>
                      <div className="text-sm text-muted-foreground">{m.member_code}</div>
                    </div>
                  </div>
                  <div>{m.is_manager && <Badge variant="secondary">Manager</Badge>}</div>
                </CardContent>
              </Card>
            ))}

            {!chama.chama_members?.length && <div>No members yet.</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ChamaDetail;
