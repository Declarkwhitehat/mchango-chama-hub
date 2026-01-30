import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  Loader2, Users, Calendar, DollarSign, TrendingUp, 
  ExternalLink, CheckCircle, XCircle, Clock, AlertTriangle,
  ArrowLeft, Shield
} from "lucide-react";
import { format } from "date-fns";

interface ChamaDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  contribution_amount: number;
  contribution_frequency: string;
  min_members: number;
  max_members: number;
  status: string;
  is_verified: boolean;
  is_public: boolean;
  group_code: string | null;
  current_cycle_round: number;
  created_at: string;
  start_date: string | null;
  total_gross_collected: number;
  total_commission_paid: number;
  available_balance: number;
  total_withdrawn: number;
  created_by: string;
}

interface ChamaMember {
  id: string;
  user_id: string;
  member_code: string;
  order_index: number | null;
  is_manager: boolean;
  status: string;
  approval_status: string;
  joined_at: string;
  total_contributed: number;
  missed_payments_count: number;
  balance_credit: number;
  balance_deficit: number;
  first_payment_completed: boolean;
  requires_admin_verification: boolean;
  profiles: {
    full_name: string;
    phone: string;
    email: string;
  } | null;
}

interface ContributionCycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  due_amount: number;
  is_complete: boolean;
  payout_processed: boolean;
  payout_amount: number;
  total_collected_amount: number;
  members_paid_count: number;
  beneficiary_member_id: string | null;
}

const AdminChamaDetail = () => {
  const { chamaId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [chama, setChama] = useState<ChamaDetail | null>(null);
  const [members, setMembers] = useState<ChamaMember[]>([]);
  const [cycles, setCycles] = useState<ContributionCycle[]>([]);
  const [creator, setCreator] = useState<{ full_name: string; email: string; phone: string } | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [contributions, setContributions] = useState<any[]>([]);

  useEffect(() => {
    if (chamaId) {
      loadChamaDetails();
    }
  }, [chamaId]);

  const loadChamaDetails = async () => {
    try {
      setLoading(true);

      // Fetch chama details
      const { data: chamaData, error: chamaError } = await supabase
        .from('chama')
        .select('*')
        .eq('id', chamaId)
        .single();

      if (chamaError) throw chamaError;
      setChama(chamaData);

      // Fetch creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', chamaData.created_by)
        .single();
      setCreator(creatorData);

      // Fetch members with profiles
      const { data: membersData } = await supabase
        .from('chama_members')
        .select(`
          *,
          profiles:user_id (full_name, phone, email)
        `)
        .eq('chama_id', chamaId)
        .order('order_index', { ascending: true });
      setMembers(membersData || []);

      // Fetch cycles
      const { data: cyclesData } = await supabase
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', chamaId)
        .order('cycle_number', { ascending: false });
      setCycles(cyclesData || []);

      // Fetch withdrawals
      const { data: withdrawalsData } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('chama_id', chamaId)
        .order('requested_at', { ascending: false });
      setWithdrawals(withdrawalsData || []);

      // Fetch contributions
      const { data: contributionsData } = await supabase
        .from('contributions')
        .select(`
          *,
          member:member_id (member_code, profiles:user_id (full_name))
        `)
        .eq('chama_id', chamaId)
        .order('contribution_date', { ascending: false })
        .limit(100);
      setContributions(contributionsData || []);

    } catch (error: any) {
      console.error('Error loading chama details:', error);
      toast({
        title: "Error",
        description: "Failed to load chama details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-600">Active</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'completed':
        return <Badge className="bg-blue-600">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const approvedMembers = members.filter(m => m.approval_status === 'approved' && m.status === 'active');
  const pendingMembers = members.filter(m => m.approval_status === 'pending');
  const membersWithMissedPayments = members.filter(m => m.missed_payments_count > 0);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!chama) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chama not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        {/* Back Button & Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/chamas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{chama.name}</h1>
              {getStatusBadge(chama.status)}
              {chama.is_verified && <Badge variant="default" className="bg-blue-600"><Shield className="h-3 w-3 mr-1" />Verified</Badge>}
            </div>
            <p className="text-muted-foreground">Group Code: {chama.group_code || 'N/A'}</p>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{approvedMembers.length} / {chama.max_members}</p>
              <p className="text-xs text-muted-foreground">Min: {chama.min_members}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Contribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KES {chama.contribution_amount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground capitalize">{chama.contribution_frequency}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Gross Collected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KES {Number(chama.total_gross_collected || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Commission: KES {Number(chama.total_commission_paid || 0).toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Available Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KES {Number(chama.available_balance || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Withdrawn: KES {Number(chama.total_withdrawn || 0).toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Cycle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">Round {chama.current_cycle_round}</p>
              <p className="text-xs text-muted-foreground">{cycles.length} total cycles</p>
            </CardContent>
          </Card>
        </div>

        {/* Alert for members with missed payments */}
        {membersWithMissedPayments.length > 0 && (
          <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" />
                {membersWithMissedPayments.length} member(s) with missed payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {membersWithMissedPayments.map(m => (
                  <Badge key={m.id} variant="destructive">
                    {m.profiles?.full_name || 'Unknown'}: {m.missed_payments_count} missed
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Tabs */}
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="cycles">Cycles</TabsTrigger>
            <TabsTrigger value="contributions">Contributions</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members">
            <Card>
              <CardHeader>
                <CardTitle>All Members</CardTitle>
                <CardDescription>Complete member list with payment status</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contributed</TableHead>
                      <TableHead>Missed</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">#{member.order_index || '-'}</span>
                            {member.is_manager && <Badge variant="outline" className="text-xs">Manager</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{member.profiles?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{member.profiles?.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell><code className="text-xs">{member.member_code}</code></TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant={member.approval_status === 'approved' ? 'default' : 'secondary'}>
                              {member.approval_status}
                            </Badge>
                            {member.requires_admin_verification && (
                              <Badge variant="destructive" className="block">Needs Verification</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>KES {Number(member.total_contributed || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          {member.missed_payments_count > 0 ? (
                            <Badge variant="destructive">{member.missed_payments_count}</Badge>
                          ) : (
                            <Badge variant="outline">0</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {Number(member.balance_credit || 0) > 0 && (
                              <Badge className="bg-green-600">+{Number(member.balance_credit).toLocaleString()}</Badge>
                            )}
                            {Number(member.balance_deficit || 0) > 0 && (
                              <Badge variant="destructive">-{Number(member.balance_deficit).toLocaleString()}</Badge>
                            )}
                            {!member.balance_credit && !member.balance_deficit && '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/admin/user/${member.user_id}`)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cycles Tab */}
          <TabsContent value="cycles">
            <Card>
              <CardHeader>
                <CardTitle>Contribution Cycles</CardTitle>
                <CardDescription>All cycle history for this chama</CardDescription>
              </CardHeader>
              <CardContent>
                {cycles.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No cycles yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cycle</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Due Amount</TableHead>
                        <TableHead>Collected</TableHead>
                        <TableHead>Paid Members</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cycles.map((cycle) => (
                        <TableRow key={cycle.id}>
                          <TableCell className="font-bold">#{cycle.cycle_number}</TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <p>{format(new Date(cycle.start_date), "MMM d")}</p>
                              <p className="text-muted-foreground">to {format(new Date(cycle.end_date), "MMM d, yyyy")}</p>
                            </div>
                          </TableCell>
                          <TableCell>KES {Number(cycle.due_amount).toLocaleString()}</TableCell>
                          <TableCell>KES {Number(cycle.total_collected_amount || 0).toLocaleString()}</TableCell>
                          <TableCell>{cycle.members_paid_count || 0}</TableCell>
                          <TableCell>
                            {cycle.payout_processed ? (
                              <span className="text-green-600 font-medium">KES {Number(cycle.payout_amount || 0).toLocaleString()}</span>
                            ) : (
                              <span className="text-muted-foreground">Pending</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {cycle.is_complete ? (
                              <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Complete</Badge>
                            ) : (
                              <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contributions Tab */}
          <TabsContent value="contributions">
            <Card>
              <CardHeader>
                <CardTitle>Contributions</CardTitle>
                <CardDescription>Recent contributions to this chama</CardDescription>
              </CardHeader>
              <CardContent>
                {contributions.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No contributions yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contributions.map((contrib) => (
                        <TableRow key={contrib.id}>
                          <TableCell>{format(new Date(contrib.contribution_date), "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{contrib.member?.profiles?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{contrib.member?.member_code}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">KES {Number(contrib.amount).toLocaleString()}</TableCell>
                          <TableCell><code className="text-xs">{contrib.payment_reference}</code></TableCell>
                          <TableCell>
                            <Badge variant={contrib.status === 'completed' ? 'default' : 'secondary'}>
                              {contrib.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card>
              <CardHeader>
                <CardTitle>Withdrawals</CardTitle>
                <CardDescription>All withdrawal requests for this chama</CardDescription>
              </CardHeader>
              <CardContent>
                {withdrawals.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No withdrawals yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Net Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {withdrawals.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell>{format(new Date(w.requested_at), "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell className="font-medium">KES {Number(w.amount).toLocaleString()}</TableCell>
                          <TableCell>KES {Number(w.commission_amount).toLocaleString()}</TableCell>
                          <TableCell className="font-medium text-green-600">KES {Number(w.net_amount).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={
                              w.status === 'completed' ? 'default' :
                              w.status === 'rejected' ? 'destructive' : 'secondary'
                            }>
                              {w.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Chama Information</CardTitle>
                <CardDescription>Complete details about this chama</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium">{chama.description || 'No description'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created By</p>
                      <p className="font-medium">{creator?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{creator?.email} • {creator?.phone}</p>
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => navigate(`/admin/user/${chama.created_by}`)}
                      >
                        View Creator Profile →
                      </Button>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created At</p>
                      <p className="font-medium">{format(new Date(chama.created_at), "PPP 'at' p")}</p>
                    </div>
                    {chama.start_date && (
                      <div>
                        <p className="text-sm text-muted-foreground">Started At</p>
                        <p className="font-medium">{format(new Date(chama.start_date), "PPP 'at' p")}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Visibility</p>
                      <p className="font-medium">{chama.is_public ? 'Public' : 'Private'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Contribution Frequency</p>
                      <p className="font-medium capitalize">{chama.contribution_frequency}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Member Limits</p>
                      <p className="font-medium">Min: {chama.min_members} / Max: {chama.max_members}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Approvals</p>
                      <p className="font-medium">{pendingMembers.length} member(s)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminChamaDetail;
