import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/ttabs";
import { Calendar, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth"; // example hook if available

// Utility for KES formatting
const formatKES = (amount: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount);

// Small reusable Stat component
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="p-4 bg-muted/50 rounded-lg text-center">
    <p className="text-sm text-muted-foreground mb-1">{label}</p>
    <p className="text-lg font-semibold text-foreground">{value}</p>
  </div>
);

const ChamaDetail = () => {
  const { id } = useParams();
  const { user } = useAuth() || {}; // assume user context is available

  const [chama, setChama] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChamaDetails = async () => {
      try {
        // Example API endpoint
        const res = await fetch(`/api/chamas/${id}`);
        const data = await res.json();

        setChama(data.chama);
        setMembers(data.members || []);
        setTransactions(data.transactions || []);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load chama details");
      } finally {
        setLoading(false);
      }
    };
    fetchChamaDetails();
  }, [id]);

  const handleJoinGroup = async () => {
    try {
      const res = await fetch(`/api/chamas/${id}/join`, { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      toast.success("Join request sent to manager!");
    } catch (error) {
      toast.error("Could not send join request");
    }
  };

  if (loading) {
    return (
      <Layout showBackButton>
        <div className="flex justify-center items-center py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 mr-2 animate-spin" /> Loading chama details...
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout showBackButton>
        <div className="text-center py-10 text-muted-foreground">
          Chama not found or you don’t have permission to view it.
        </div>
      </Layout>
    );
  }

  // Role-based logic
  const isManager = user?.id === chama.managerId;
  const isMember = members.some((m) => m.userId === user?.id);
  const isVisitor = !isManager && !isMember;

  // Commission & balance logic
  const commissionRate = 0.05;
  const total = chama.totalSavings || 0;
  const commission = total * commissionRate;
  const net = total - commission;

  // Find next payout recipient (Prompt 14)
  const nextRecipient = members.find((m) => m.orderIndex === chama.currentCycle);

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge variant="secondary">{chama.category}</Badge>
              <Badge>
                {members.length}/{chama.maxMembers} members
              </Badge>
            </div>
            <CardTitle className="text-2xl">{chama.name}</CardTitle>
            <CardDescription>Created by {chama.createdBy?.name || "Unknown"}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-foreground leading-relaxed">{chama.description}</p>

            {/* Stats Section */}
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Total Collected" value={formatKES(total)} />
              <Stat label="Commission (5%)" value={formatKES(commission)} />
              <Stat label="Net Balance" value={formatKES(net)} />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Next meeting:{" "}
                {chama.nextMeeting
                  ? new Date(chama.nextMeeting).toLocaleDateString()
                  : "Not scheduled"}
              </div>
            </div>

            {nextRecipient && (
              <div className="pt-2 text-sm text-muted-foreground">
                💰 Next payout goes to <strong>{nextRecipient.name}</strong>
              </div>
            )}

            {isVisitor && (
              <Button variant="heroSecondary" className="w-full" onClick={handleJoinGroup}>
                <UserPlus className="mr-2 h-4 w-4" />
                Request to Join
              </Button>
            )}

            {isManager && (
              <Button variant="outline" className="w-full">
                Manage Chama
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Group Members</CardTitle>
                <CardDescription>Current contribution status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet</p>
                  ) : (
                    members.map((member, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{member.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-foreground">{member.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Joined: {new Date(member.joinDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={member.status === "paid" ? "default" : "secondary"}
                        >
                          {member.status || "pending"}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Recent group activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transactions yet</p>
                  ) : (
                    transactions.map((txn, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between pb-4 border-b border-border last:border-0"
                      >
                        <div>
                          <p className="font-medium text-foreground">{txn.type}</p>
                          <p className="text-sm text-muted-foreground">{txn.member}</p>
                          <p className="text-xs text-muted-foreground">{txn.date}</p>
                        </div>
                        <span
                          className={`font-semibold ${
                            txn.amount > 0 ? "text-primary" : "text-destructive"
                          }`}
                        >
                          {txn.amount > 0 ? "+" : "-"}
                          {formatKES(Math.abs(txn.amount))}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default ChamaDetail;
