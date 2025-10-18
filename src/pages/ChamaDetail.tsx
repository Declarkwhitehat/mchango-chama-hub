import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // ✅ fixed import
import { Calendar, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ✅ Temporary fallback for authentication
const useAuth = () => ({
  user: { id: 1, name: "Demo User", role: "manager" },
});

// ✅ Format currency in KES
const formatKES = (amount: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount);

// ✅ Reusable Stat card
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="p-4 bg-muted/50 rounded-lg text-center">
    <p className="text-sm text-muted-foreground mb-1">{label}</p>
    <p className="text-lg font-semibold text-foreground">{value}</p>
  </div>
);

// ✅ Main Component
export default function ChamaDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [chama, setChama] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    const fetchChama = async () => {
      try {
        const res = await fetch(`/api/chamas/${id}`);
        if (!res.ok) throw new Error("Failed to load chama");
        const data = await res.json();
        setChama(data);
        setMembers(data.members || []);
      } catch (err) {
        console.error(err);
        toast.error("Error loading chama details");
      } finally {
        setLoading(false);
      }
    };
    fetchChama();
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-muted-foreground w-6 h-6" />
          <span className="ml-2 text-muted-foreground">Loading chama details...</span>
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout>
        <Card className="max-w-md mx-auto mt-10 text-center">
          <CardHeader>
            <CardTitle>Chama not found</CardTitle>
            <CardDescription>This chama does not exist or has been deleted.</CardDescription>
          </CardHeader>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto mt-6">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-2xl font-semibold">{chama.name}</CardTitle>
                <CardDescription>
                  {chama.is_public ? "Public Chama" : "Private Chama"}
                </CardDescription>
              </div>
              {user.role === "manager" && (
                <Button className="gap-2">
                  <UserPlus size={16} />
                  Invite Members
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Total Members" value={members.length.toString()} />
            <Stat label="Contribution" value={formatKES(chama.contribution_amount)} />
            <Stat label="Frequency" value={chama.frequency} />
          </CardContent>
        </Card>

        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>View all members in this chama</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {members.length === 0 ? (
                  <p className="text-muted-foreground">No members yet</p>
                ) : (
                  members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between border-b pb-2 last:border-none"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {m.name ? m.name[0].toUpperCase() : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{m.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Joined: {new Date(m.join_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {m.is_paid ? "Paid" : "Pending"}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>Track all contributions and payouts</CardDescription>
              </CardHeader>
              <CardContent>
                {chama.payments && chama.payments.length > 0 ? (
                  chama.payments.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex justify-between items-center border-b py-2 last:border-none"
                    >
                      <div>
                        <p className="font-medium">
                          {p.member_name || "Member"} — {formatKES(p.amount)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(p.date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        variant={p.status === "completed" ? "default" : "secondary"}
                      >
                        {p.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No payment history yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Chama Settings</CardTitle>
                <CardDescription>
                  Update chama information and configurations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Only managers can edit chama settings.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
