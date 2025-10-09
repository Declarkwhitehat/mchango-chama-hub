import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChamaInviteManager } from "@/components/ChamaInviteManager";
import { Users, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ChamaData {
  id: string;
  name: string;
  slug: string;
  description: string;
  contribution_amount: number;
  contribution_frequency: string;
  max_members: number;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
  };
  chama_members: Array<{
    id: string;
    member_code: string;
    order_index: number;
    is_manager: boolean;
    approval_status: string;
    joined_at: string;
    profiles: {
      full_name: string;
      email: string;
    };
  }>;
}

const ChamaDetail = () => {
  const { id } = useParams();
  const [chama, setChama] = useState<ChamaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserMembership, setCurrentUserMembership] = useState<any>(null);

  useEffect(() => {
    loadChama();
  }, [id]);

  const loadChama = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(`chama-crud/${id}`);

      if (error) throw error;

      setChama(data.data);

      // Check current user's membership
      const { data: { user } } = await supabase.auth.getUser();
      if (user && data.data.chama_members) {
        const membership = data.data.chama_members.find(
          (m: any) => m.user_id === user.id
        );
        setCurrentUserMembership(membership);
      }
    } catch (error: any) {
      console.error("Error loading chama:", error);
      toast({
        title: "Error",
        description: "Failed to load chama details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!chama) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Chama not found</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const approvedMembers = chama.chama_members?.filter(m => m.approval_status === 'approved') || [];
  const isManager = currentUserMembership?.is_manager && currentUserMembership?.approval_status === 'approved';
  const isMember = currentUserMembership?.approval_status === 'approved';
  const isPending = currentUserMembership?.approval_status === 'pending';

  // Calculate total contributions (mock for now)
  const totalSavings = approvedMembers.length * chama.contribution_amount;

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge>
                {approvedMembers.length}/{chama.max_members} members
              </Badge>
              {isManager && <Badge variant="default">Manager</Badge>}
              {isPending && <Badge variant="secondary">Pending Approval</Badge>}
            </div>
            <CardTitle className="text-2xl">{chama.name}</CardTitle>
            <CardDescription>Founded by {chama.profiles.full_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground leading-relaxed">{chama.description}</p>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Pool</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {totalSavings.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Contribution</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {chama.contribution_amount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Frequency: {chama.contribution_frequency}</span>
            </div>
          </CardContent>
        </Card>

        {/* Manager Tools */}
        {isManager && (
          <ChamaInviteManager chamaId={chama.id} isManager={true} />
        )}

        {/* Tabs - Only visible to approved members */}
        {isMember && (
          <Tabs defaultValue="members" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle>Group Members ({approvedMembers.length})</CardTitle>
                  <CardDescription>Approved members by join order</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {approvedMembers
                      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                      .map((member) => (
                        <div key={member.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>
                                {member.profiles.full_name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">
                                {member.profiles.full_name}
                                {member.is_manager && (
                                  <Badge variant="outline" className="ml-2">Manager</Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.member_code} • Position #{member.order_index}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Chama Details</CardTitle>
                  <CardDescription>Group information and settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {new Date(chama.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contribution Frequency</p>
                    <p className="font-medium capitalize">{chama.contribution_frequency}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Member Capacity</p>
                    <p className="font-medium">
                      {approvedMembers.length} / {chama.max_members} members
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Pending approval message */}
        {isPending && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Your join request is pending manager approval
              </p>
            </CardContent>
          </Card>
        )}

        {/* Non-member view */}
        {!isMember && !isPending && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                You need to join this chama to view member details.
                <br />
                Ask a manager for an invite code.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default ChamaDetail;
