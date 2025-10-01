import { useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Calendar, Share2, Heart } from "lucide-react";
import { toast } from "sonner";

const MchangoDetail = () => {
  const { id } = useParams();
  const [amount, setAmount] = useState("");

  // Mock data
  const campaign = {
    id,
    title: "Medical Emergency Fund",
    description: "My family member urgently needs medical treatment. The hospital bills are mounting and we need support from the community. Any contribution, no matter how small, will make a huge difference.",
    goal: 50000,
    raised: 32000,
    contributors: 45,
    daysLeft: 12,
    category: "Medical",
    createdBy: "John Kamau",
    createdAt: "2025-09-20",
  };

  const recentContributions = [
    { name: "Sarah M.", amount: 1000, time: "2 hours ago" },
    { name: "Peter K.", amount: 2500, time: "5 hours ago" },
    { name: "Grace W.", amount: 500, time: "1 day ago" },
  ];

  const handleContribute = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    toast.success(`Contribution of KES ${amount} recorded!`);
    setAmount("");
  };

  const handleShare = () => {
    toast.success("Link copied to clipboard!");
  };

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Campaign Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge variant="secondary">{campaign.category}</Badge>
              <Badge>{campaign.daysLeft} days left</Badge>
            </div>
            <CardTitle className="text-2xl">{campaign.title}</CardTitle>
            <CardDescription>by {campaign.createdBy}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground leading-relaxed">{campaign.description}</p>

            <div className="space-y-2 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  KES {campaign.raised.toLocaleString()} raised
                </span>
                <span className="font-semibold text-foreground">
                  of KES {campaign.goal.toLocaleString()}
                </span>
              </div>
              <Progress value={(campaign.raised / campaign.goal) * 100} className="h-3" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {campaign.contributors} contributors
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contribute Section */}
        <Card>
          <CardHeader>
            <CardTitle>Make a Contribution</CardTitle>
            <CardDescription>Support this campaign</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (KES)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="hero"
                className="flex-1"
                onClick={handleContribute}
              >
                <Heart className="mr-2 h-4 w-4" />
                Contribute
              </Button>
              <Button variant="outline" size="icon" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Contributions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Contributions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentContributions.map((contribution, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{contribution.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{contribution.name}</p>
                      <p className="text-sm text-muted-foreground">{contribution.time}</p>
                    </div>
                  </div>
                  <span className="font-semibold text-primary">
                    KES {contribution.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default MchangoDetail;
