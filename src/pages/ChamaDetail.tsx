import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Users, Calendar, TrendingUp, Loader2 } from "lucide-react";

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

      // First: call the server function properly (pass id in body)
      try {
        const res = await supabase.functions.invoke("chama-crud", {
          body: { id },
        });

        console.log("chama-crud invoke response:", res);

        if (res?.error) {
          // If function returns an error object, throw to trigger fallback
          const apiError = (res.data as any)?.error || (res.data as any)?.message || res.error.message;
          throw new Error(apiError || "Server function error");
        }

        const returned = (res.data as any)?.data ?? res.data;
        if (returned) {
          setChama(returned);
          // set membership for current user if present
          const { data: { user } } = await supabase.auth.getUser();
          if (user && returned.chama_members) {
            const membership = returned.chama_members.find((m: any) => m.user_id === user.id);
            setCurrentUserMembership(membership ?? null);
          }
          return;
        }
      } catch (fnErr) {
        // Log the function error and proceed to fallback to direct query
        console.warn("chama-crud function failed, falling back to direct query. Error:", fnErr);
      }

      // Fallback 1: try direct Supabase query by id
      const { data: byId, error: errById } = await supabase
        .from("chama")
        .select(`
          *,
          profiles:created_by ( full_name, email, phone ),
          chama_members ( id, user_id, member_code, is_manager, joined_at, status, approval_status, order_index, profiles ( full_name, email ) )
        `)
        .eq("id", id)
        .maybeSingle();

      if (errById) {
        console.warn("Direct query by id error:", errById);
      }

      if (byId) {
        setChama(byId);
        const { data: { user } } = await supabase.auth.getUser();
        if (user && byId.chama_members) {
          const membership = byId.chama_members.find((m: any) => m.user_id === user.id);
          setCurrentUserMembership(membership ?? null);
        }
        return;
      }

      // Fallback 2: try direct query by slug
      const { data: bySlug, error: errBySlug } = await supabase
        .from("chama")
        .select(`
          *,
          profiles:created_by ( full_name, email, phone ),
          chama_members ( id, user_id, member_code, is_manager, joined_at, status, approval_status, order_index, profiles ( full_name, email ) )
        `)
        .eq("slug", id)
        .maybeSingle();

      if (errBySlug) {
        console.warn("Direct query by slug error:", errBySlug);
      }

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
      <Layout showBackButton>
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
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Chama not found</CardTitle>
            </CardHeader>
            <CardContent>
              <p>We couldn't find the chama. It might be private or removed.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Render basic header — you can expand with your existing UI pieces
  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              {chama.category && <Badge variant="secondary">{chama.category}</Badge>}
              <div className="flex gap-2">
                <Badge>{chama.contribution_frequency}</Badge>
              </div>
            </div>
            <CardTitle>{chama.title}</CardTitle>
            <CardDescription>{chama.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarFallback>{(chama.created_by?.full_name || "C").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{chama.created_by?.full_name}</div>
                <div className="text-sm text-muted-foreground">{chama.created_at}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-lg font-semibold mb-2">Members</h3>
          <div className="grid grid-cols-1 gap-3">
            {chama.chama_members?.map((m: ChamaMember) => (
              <Card key={m.id}>
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{(m.profiles?.full_name || "M").slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{m.profiles?.full_name || m.user_id}</div>
                      <div className="text-sm text-muted-foreground">{m.member_code}</div>
                    </div>
                  </div>
                  <div>
                    {m.is_manager && <Badge variant="secondary">Manager</Badge>}
                  </div>
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

export default ChamaDetail;                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="unique-slug" />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your chama" />
              </div>

              <div>
                <Label>Category</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Savings" />
              </div>

              <div>
                <Label>Contribution amount</Label>
                <Input
                  type="number"
                  value={contributionAmount === "" ? "" : contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Amount"
                />
              </div>

              <div>
                <Label>Contribution frequency</Label>
                <Select value={contributionFrequency} onValueChange={(val) => setContributionFrequency(val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Chama"}
                </Button>
                <Button variant="ghost" onClick={() => navigate(-1)} type="button">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ChamaCreate;
