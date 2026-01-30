import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  Loader2, Users, Calendar, DollarSign, TrendingUp, 
  ExternalLink, Target, Shield, ArrowLeft, Eye
} from "lucide-react";
import { format } from "date-fns";

interface CampaignDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  status: string;
  is_verified: boolean;
  is_public: boolean;
  group_code: string | null;
  category: string | null;
  created_at: string;
  end_date: string | null;
  total_gross_collected: number;
  total_commission_paid: number;
  available_balance: number;
  image_url: string | null;
  youtube_url: string | null;
  whatsapp_link: string | null;
  created_by: string;
}

interface Donation {
  id: string;
  amount: number;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  is_anonymous: boolean;
  payment_status: string;
  payment_reference: string;
  created_at: string;
  completed_at: string | null;
  user_id: string | null;
}

const AdminCampaignDetail = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [creator, setCreator] = useState<{ full_name: string; email: string; phone: string } | null>(null);

  useEffect(() => {
    if (campaignId) {
      loadCampaignDetails();
    }
  }, [campaignId]);

  const loadCampaignDetails = async () => {
    try {
      setLoading(true);

      // Fetch campaign details
      const { data: campaignData, error: campaignError } = await supabase
        .from('mchango')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      // Fetch creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', campaignData.created_by)
        .single();
      setCreator(creatorData);

      // Fetch all donations
      const { data: donationsData } = await supabase
        .from('mchango_donations')
        .select('*')
        .eq('mchango_id', campaignId)
        .order('created_at', { ascending: false });
      setDonations(donationsData || []);

      // Fetch withdrawals
      const { data: withdrawalsData } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('mchango_id', campaignId)
        .order('requested_at', { ascending: false });
      setWithdrawals(withdrawalsData || []);

    } catch (error: any) {
      console.error('Error loading campaign details:', error);
      toast({
        title: "Error",
        description: "Failed to load campaign details",
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
      case 'completed':
        return <Badge className="bg-blue-600">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const completedDonations = donations.filter(d => d.payment_status === 'completed');
  const pendingDonations = donations.filter(d => d.payment_status === 'pending');
  const totalDonors = new Set(completedDonations.map(d => d.phone || d.email || d.user_id)).size;
  const progress = campaign ? (campaign.current_amount / campaign.target_amount) * 100 : 0;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!campaign) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Campaign not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        {/* Back Button & Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/campaigns')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{campaign.title}</h1>
              {getStatusBadge(campaign.status)}
              {campaign.is_verified && <Badge variant="default" className="bg-blue-600"><Shield className="h-3 w-3 mr-1" />Verified</Badge>}
            </div>
            <p className="text-muted-foreground">Code: {campaign.group_code || 'N/A'} • Category: {campaign.category || 'General'}</p>
          </div>
        </div>

        {/* Progress Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold">KES {Number(campaign.current_amount).toLocaleString()}</span>
              <span className="text-muted-foreground">of KES {Number(campaign.target_amount).toLocaleString()}</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-3" />
            <p className="text-sm text-muted-foreground mt-2">{progress.toFixed(1)}% funded • {totalDonors} donors</p>
          </CardContent>
        </Card>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KES {Number(campaign.target_amount).toLocaleString()}</p>
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
              <p className="text-2xl font-bold">KES {Number(campaign.total_gross_collected || 0).toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Commission Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KES {Number(campaign.total_commission_paid || 0).toLocaleString()}</p>
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
              <p className="text-2xl font-bold">KES {Number(campaign.available_balance || 0).toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Donations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{completedDonations.length}</p>
              <p className="text-xs text-muted-foreground">{pendingDonations.length} pending</p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="donations" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="donations">Donations ({donations.length})</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
          </TabsList>

          {/* Donations Tab */}
          <TabsContent value="donations">
            <Card>
              <CardHeader>
                <CardTitle>All Donations</CardTitle>
                <CardDescription>Complete donation history for this campaign</CardDescription>
              </CardHeader>
              <CardContent>
                {donations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No donations yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Donor</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {donations.map((donation) => (
                        <TableRow key={donation.id}>
                          <TableCell>{format(new Date(donation.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {donation.is_anonymous ? 'Anonymous' : donation.display_name || 'Unknown'}
                              </p>
                              {!donation.is_anonymous && (
                                <p className="text-xs text-muted-foreground">{donation.phone || donation.email}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>KES {Number(donation.gross_amount || donation.amount).toLocaleString()}</TableCell>
                          <TableCell>KES {Number(donation.commission_amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="font-medium text-green-600">
                            KES {Number(donation.net_amount || donation.amount).toLocaleString()}
                          </TableCell>
                          <TableCell><code className="text-xs">{donation.payment_reference}</code></TableCell>
                          <TableCell>
                            <Badge variant={donation.payment_status === 'completed' ? 'default' : 'secondary'}>
                              {donation.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {donation.user_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/admin/user/${donation.user_id}`)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
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

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card>
              <CardHeader>
                <CardTitle>Withdrawals</CardTitle>
                <CardDescription>All withdrawal requests for this campaign</CardDescription>
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
                        <TableHead>Reference</TableHead>
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
                          <TableCell><code className="text-xs">{w.payment_reference || '-'}</code></TableCell>
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
                <CardTitle>Campaign Information</CardTitle>
                <CardDescription>Complete details about this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium">{campaign.description || 'No description'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created By</p>
                      <p className="font-medium">{creator?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{creator?.email} • {creator?.phone}</p>
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => navigate(`/admin/user/${campaign.created_by}`)}
                      >
                        View Creator Profile →
                      </Button>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created At</p>
                      <p className="font-medium">{format(new Date(campaign.created_at), "PPP 'at' p")}</p>
                    </div>
                    {campaign.end_date && (
                      <div>
                        <p className="text-sm text-muted-foreground">End Date</p>
                        <p className="font-medium">{format(new Date(campaign.end_date), "PPP")}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Visibility</p>
                      <p className="font-medium">{campaign.is_public ? 'Public' : 'Private'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium">{campaign.category || 'General'}</p>
                    </div>
                    {campaign.whatsapp_link && (
                      <div>
                        <p className="text-sm text-muted-foreground">WhatsApp Group</p>
                        <a href={campaign.whatsapp_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Open WhatsApp →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Media Tab */}
          <TabsContent value="media">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Media</CardTitle>
                <CardDescription>Images and videos for this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaign.image_url ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Campaign Image</p>
                    <img src={campaign.image_url} alt={campaign.title} className="max-w-md rounded-lg border" />
                  </div>
                ) : (
                  <p className="text-muted-foreground">No image uploaded</p>
                )}

                {campaign.youtube_url && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">YouTube Video</p>
                    <a href={campaign.youtube_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Watch Video →
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminCampaignDetail;
