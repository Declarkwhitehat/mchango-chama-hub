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
  Loader2, Users, DollarSign, TrendingUp, 
  ExternalLink, Building2, Shield, ArrowLeft, MapPin, Globe, Phone, Mail
} from "lucide-react";
import { format } from "date-fns";

interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  about: string | null;
  category: string;
  current_amount: number;
  status: string;
  is_verified: boolean;
  is_public: boolean;
  group_code: string | null;
  created_at: string;
  total_gross_collected: number;
  total_commission_paid: number;
  available_balance: number;
  logo_url: string | null;
  cover_image_url: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  whatsapp_link: string | null;
  youtube_url: string | null;
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

const AdminOrganizationDetail = () => {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [creator, setCreator] = useState<{ full_name: string; email: string; phone: string } | null>(null);

  useEffect(() => {
    if (organizationId) {
      loadOrganizationDetails();
    }
  }, [organizationId]);

  const loadOrganizationDetails = async () => {
    try {
      setLoading(true);

      // Fetch organization details
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (orgError) throw orgError;
      setOrganization(orgData);

      // Fetch creator profile
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', orgData.created_by)
        .single();
      setCreator(creatorData);

      // Fetch all donations
      const { data: donationsData } = await supabase
        .from('organization_donations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      setDonations(donationsData || []);

      // Note: Organizations might not have withdrawals table reference
      // If they do, uncomment and adjust:
      // const { data: withdrawalsData } = await supabase
      //   .from('withdrawals')
      //   .select('*')
      //   .eq('organization_id', organizationId)
      //   .order('requested_at', { ascending: false });
      // setWithdrawals(withdrawalsData || []);

    } catch (error: any) {
      console.error('Error loading organization details:', error);
      toast({
        title: "Error",
        description: "Failed to load organization details",
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
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const completedDonations = donations.filter(d => d.payment_status === 'completed');
  const pendingDonations = donations.filter(d => d.payment_status === 'pending');
  const totalDonors = new Set(completedDonations.map(d => d.phone || d.email || d.user_id)).size;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!organization) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Organization not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        {/* Back Button & Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/organizations')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {organization.logo_url && (
                <img src={organization.logo_url} alt={organization.name} className="h-12 w-12 rounded-lg object-cover" />
              )}
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold">{organization.name}</h1>
                  {getStatusBadge(organization.status)}
                  {organization.is_verified && <Badge variant="default" className="bg-blue-600"><Shield className="h-3 w-3 mr-1" />Verified</Badge>}
                </div>
                <p className="text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {organization.category} • Code: {organization.group_code || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KES {Number(organization.current_amount).toLocaleString()}</p>
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
              <p className="text-2xl font-bold">KES {Number(organization.total_gross_collected || 0).toLocaleString()}</p>
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
              <p className="text-2xl font-bold">KES {Number(organization.total_commission_paid || 0).toLocaleString()}</p>
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
              <p className="text-2xl font-bold">KES {Number(organization.available_balance || 0).toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Donors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalDonors}</p>
              <p className="text-xs text-muted-foreground">{completedDonations.length} donations</p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="donations" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="donations">Donations ({donations.length})</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="contact">Contact Info</TabsTrigger>
          </TabsList>

          {/* Donations Tab */}
          <TabsContent value="donations">
            <Card>
              <CardHeader>
                <CardTitle>All Donations</CardTitle>
                <CardDescription>Complete donation history for this organization</CardDescription>
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

          {/* Details Tab */}
          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Organization Information</CardTitle>
                <CardDescription>Complete details about this organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium">{organization.description || 'No description'}</p>
                    </div>
                    {organization.about && (
                      <div>
                        <p className="text-sm text-muted-foreground">About</p>
                        <p className="font-medium">{organization.about}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Created By</p>
                      <p className="font-medium">{creator?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{creator?.email} • {creator?.phone}</p>
                      <Button
                        size="sm"
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => navigate(`/admin/user/${organization.created_by}`)}
                      >
                        View Creator Profile →
                      </Button>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created At</p>
                      <p className="font-medium">{format(new Date(organization.created_at), "PPP 'at' p")}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Visibility</p>
                      <p className="font-medium">{organization.is_public ? 'Public' : 'Private'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium">{organization.category}</p>
                    </div>
                    {organization.cover_image_url && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Cover Image</p>
                        <img src={organization.cover_image_url} alt="Cover" className="max-w-full rounded-lg border" />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contact Tab */}
          <TabsContent value="contact">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>Organization contact details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {organization.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{organization.phone}</p>
                      </div>
                    </div>
                  )}
                  {organization.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{organization.email}</p>
                      </div>
                    </div>
                  )}
                  {organization.location && (
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">{organization.location}</p>
                      </div>
                    </div>
                  )}
                  {organization.website_url && (
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Website</p>
                        <a href={organization.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {organization.website_url}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
                {!organization.phone && !organization.email && !organization.location && !organization.website_url && (
                  <p className="text-center py-8 text-muted-foreground">No contact information available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminOrganizationDetail;
