import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Calendar, TrendingUp, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getChamaCommissionInfo } from "@/utils/commissionCalculator";
import { ChamaPaymentForm } from "@/components/ChamaPaymentForm";

const ChamaDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch chama details
  const { data: chama, isLoading, error } = useQuery({
    queryKey: ['chama', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chama')
        .select(`
          id, name, slug, description, created_at, is_public, min_members, max_members, contribution_amount, contribution_frequency, every_n_days_count, payout_order, status, commission_rate, whatsapp_link,
          chama_members (
            id, user_id, is_manager, member_code, order_index, status, approval_status, joined_at, last_payment_date, next_due_date,
            profiles ( full_name )
          )
        `)
        .eq('slug', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Chama not found');
      
      return data as any;
    },
    enabled: !!id,
  });

  // Calculate total pool and commission
  const totalPool = chama ? Number(chama.contribution_amount) * (chama.chama_members?.filter((m: any) => m.approval_status === 'approved').length || 0) : 0;
  const commissionInfo = getChamaCommissionInfo(totalPool, chama?.commission_rate || 0.05);

  const handleJoinGroup = async () => {
    if (!user) {
      toast.error("Please login to join this chama");
      navigate('/auth');
      return;
    }

    try {
      const { error } = await supabase
        .from('chama_members')
        .insert([{
          chama_id: id!,
          user_id: user.id,
          approval_status: 'pending',
          status: 'active',
          member_code: `TEMP-${Date.now()}`
        }]);

      if (error) throw error;
      toast.success("Request to join group sent!");
    } catch (error: any) {
      toast.error(error.message || "Failed to send join request");
    }
  };

  if (isLoading) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !chama) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                {error ? 'Failed to load chama details' : 'Chama not found'}
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const approvedMembers = chama.chama_members?.filter((m: any) => m.approval_status === 'approved') || [];
  const isManager = chama.chama_members?.some((m: any) => m.user_id === user?.id && m.is_manager);
  const isMember = chama.chama_members?.some((m: any) => m.user_id === user?.id);
  
  const frequencyText = chama.contribution_frequency === 'every_n_days' 
    ? `Every ${chama.every_n_days_count} days`
    : chama.contribution_frequency;

  const currentMember = chama.chama_members?.find((m: any) => m.user_id === user?.id);

  const queueLeader = (approvedMembers.length > 0)
    ? [...approvedMembers].sort((a: any, b: any) => {
        const aDate = a.next_due_date ? new Date(a.next_due_date).getTime() : Infinity;
        const bDate = b.next_due_date ? new Date(b.next_due_date).getTime() : Infinity;
        if (aDate !== bDate) return aDate - bDate;
        return (a.order_index || 9999) - (b.order_index || 9999);
      })[0]
    : null;

  const nextCycleDate: Date | undefined = (approvedMembers.length > 0)
    ? approvedMembers
        .map((m: any) => (m.next_due_date ? new Date(m.next_due_date) : null))
        .filter((d: Date | null) => !!d)
        .sort((a: any, b: any) => a.getTime() - b.getTime())[0] as Date | undefined
    : undefined;

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge variant="secondary">{chama.is_public ? 'Public' : 'Private'}</Badge>
              <Badge>
                {approvedMembers.length}/{chama.max_members} members
              </Badge>
            </div>
            <CardTitle className="text-2xl">{chama.name}</CardTitle>
            <CardDescription>
              Created {new Date(chama.created_at).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {chama.description && (
              <p className="text-foreground leading-relaxed">{chama.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Contribution Amount</p>
                <p className="text-2xl font-bold text-foreground">
                  KES {Number(chama.contribution_amount).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Frequency</p>
                <p className="text-xl font-bold text-foreground capitalize">
                  {frequencyText}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Pool</p>
                <p className="text-xl font-bold text-foreground">
                  KES {totalPool.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Commission ({commissionInfo.percentage})</p>
                <p className="text-xl font-bold text-foreground">
                  KES {commissionInfo.commission.toLocaleString()}
                </p>
              </div>
            </div>

            {chama.whatsapp_link && (
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => window.open(chama.whatsapp_link, '_blank')}
              >
                Join WhatsApp Group
              </Button>
            )}

            {!isMember && (
              <Button variant="heroSecondary" className="w-full" onClick={handleJoinGroup}>
                <UserPlus className="mr-2 h-4 w-4" />
                Request to Join
              </Button>
            )}

            {isManager && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => navigate(`/chama/${id}/manage`)}
                >
                  Manage Chama
                </Button>
              </div>
            )}
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
                <CardTitle>Group Members ({approvedMembers.length})</CardTitle>
                <CardDescription>Current members - Min: {chama.min_members}, Max: {chama.max_members}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {approvedMembers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No members yet</p>
                  ) : (
                    approvedMembers.map((member: any) => (
                      <div key={member.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {member.profiles?.full_name?.charAt(0) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-foreground">
                              {member.profiles?.full_name || 'Unknown'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {member.member_code}
                              {member.is_manager && ' • Manager'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={member.status === "active" ? "default" : "secondary"}>
                            {member.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            Joined {new Date(member.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Chama Details</CardTitle>
                <CardDescription>Configuration and settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge>{chama.status}</Badge>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-sm text-muted-foreground">Payout Order</span>
                    <span className="font-medium">{chama.payout_order}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-sm text-muted-foreground">Visibility</span>
                    <span className="font-medium">{chama.is_public ? 'Public' : 'Private'}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-sm text-muted-foreground">Commission Rate</span>
                    <span className="font-medium">{commissionInfo.percentage}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-sm text-muted-foreground">Next Payout To</span>
                    <span className="font-medium">
                      {queueLeader?.profiles?.full_name || queueLeader?.member_code || 'TBD'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-sm text-muted-foreground">Next Cycle</span>
                    <span className="font-medium">
                      {nextCycleDate ? new Date(nextCycleDate).toLocaleDateString() : 'TBD'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Net Payout Amount</span>
                    <span className="font-bold text-primary">
                      KES {commissionInfo.netBalance.toLocaleString()}
                    </span>
                  </div>
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
