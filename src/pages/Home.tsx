import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { TrendingUp, Users, Plus, Calendar } from "lucide-react";

const Home = () => {
  const [activeTab, setActiveTab] = useState("mchango");

  // Mock data
  const mchangoList = [
    {
      id: "1",
      title: "Medical Emergency Fund",
      description: "Help cover urgent medical expenses",
      goal: 50000,
      raised: 32000,
      contributors: 45,
      daysLeft: 12,
    },
    {
      id: "2",
      title: "School Fees Support",
      description: "Support education for bright students",
      goal: 30000,
      raised: 28000,
      contributors: 62,
      daysLeft: 5,
    },
  ];

  const chamaList = [
    {
      id: "1",
      name: "Women Empowerment Group",
      description: "Monthly savings for business growth",
      members: 24,
      totalSavings: 120000,
      nextMeeting: "2025-10-08",
    },
    {
      id: "2",
      name: "Youth Investment Circle",
      description: "Building wealth through collective savings",
      members: 18,
      totalSavings: 85000,
      nextMeeting: "2025-10-15",
    },
  ];

  return (
    <Layout>
      <div className="container px-4 py-6 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Manage your financial journey</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="mchango" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Mchango
            </TabsTrigger>
            <TabsTrigger value="chama" className="gap-2">
              <Users className="h-4 w-4" />
              Chama
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mchango" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-foreground">My Campaigns</h2>
              <Link to="/mchango/create">
                <Button variant="hero" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </Link>
            </div>

            <div className="space-y-4">
              {mchangoList.map((campaign) => (
                <Link key={campaign.id} to={`/mchango/${campaign.id}`}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{campaign.title}</CardTitle>
                          <CardDescription>{campaign.description}</CardDescription>
                        </div>
                        <Badge variant="secondary">{campaign.daysLeft} days</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          KES {campaign.raised.toLocaleString()} raised
                        </span>
                        <span className="font-semibold text-foreground">
                          of KES {campaign.goal.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={(campaign.raised / campaign.goal) * 100} />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {campaign.contributors} contributors
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="chama" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-foreground">My Groups</h2>
              <Link to="/chama/create">
                <Button variant="heroSecondary" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </Link>
            </div>

            <div className="space-y-4">
              {chamaList.map((group) => (
                <Link key={group.id} to={`/chama/${group.id}`}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      <CardDescription>{group.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Savings</p>
                          <p className="text-xl font-bold text-foreground">
                            KES {group.totalSavings.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Members</p>
                          <p className="text-xl font-bold text-foreground">{group.members}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t border-border">
                        <Calendar className="h-4 w-4" />
                        Next meeting: {new Date(group.nextMeeting).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Home;
