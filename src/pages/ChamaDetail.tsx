import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, TrendingUp, UserPlus } from "lucide-react";
import { toast } from "sonner";

const ChamaDetail = () => {
  const { id } = useParams();

  // Mock data
  const chama = {
    id,
    name: "Women Empowerment Group",
    description: "Monthly savings for business growth and mutual support",
    members: 24,
    maxMembers: 30,
    totalSavings: 120000,
    monthlyContribution: 5000,
    nextMeeting: "2025-10-08",
    meetingDay: "First Tuesday",
    category: "Business Investment",
    createdBy: "Jane Wanjiku",
    createdAt: "2025-06-15",
  };

  const members = [
    { name: "Jane W.", contribution: 5000, status: "paid" },
    { name: "Mary K.", contribution: 5000, status: "paid" },
    { name: "Sarah M.", contribution: 5000, status: "pending" },
    { name: "Grace N.", contribution: 5000, status: "paid" },
  ];

  const transactions = [
    { date: "2025-09-01", type: "Contribution", member: "Jane W.", amount: 5000 },
    { date: "2025-09-01", type: "Contribution", member: "Mary K.", amount: 5000 },
    { date: "2025-08-15", type: "Loan", member: "Sarah M.", amount: -15000 },
  ];

  const handleJoinGroup = () => {
    toast.success("Request to join group sent!");
  };

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge variant="secondary">{chama.category}</Badge>
              <Badge>
                {chama.members}/{chama.maxMembers} members
              </Badge>
            </div>
            <CardTitle className="text-2xl">{chama.name}</CardTitle>
            <CardDescription>Founded by {chama.createdBy}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground leading-relaxed">{chama.description}</p>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {chama.totalSavings.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Monthly Contribution</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {chama.monthlyContribution.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Next meeting: {new Date(chama.nextMeeting).toLocaleDateString()}
              </div>
            </div>

            <Button variant="heroSecondary" className="w-full" onClick={handleJoinGroup}>
              <UserPlus className="mr-2 h-4 w-4" />
              Request to Join
            </Button>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>Group Members</CardTitle>
                <CardDescription>Current contribution status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {members.map((member, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-foreground">{member.name}</p>
                          <p className="text-sm text-muted-foreground">
                            KES {member.contribution.toLocaleString()}/month
                          </p>
                        </div>
                      </div>
                      <Badge variant={member.status === "paid" ? "default" : "secondary"}>
                        {member.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Recent group activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {transactions.map((transaction, index) => (
                    <div key={index} className="flex items-center justify-between pb-4 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{transaction.type}</p>
                        <p className="text-sm text-muted-foreground">{transaction.member}</p>
                        <p className="text-xs text-muted-foreground">{transaction.date}</p>
                      </div>
                      <span className={`font-semibold ${transaction.amount > 0 ? 'text-primary' : 'text-destructive'}`}>
                        {transaction.amount > 0 ? '+' : ''}KES {Math.abs(transaction.amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
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
