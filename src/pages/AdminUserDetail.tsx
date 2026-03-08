import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { 
  Loader2, User, Mail, Phone, CreditCard, Shield, FileText, 
  TrendingUp, Users, Activity, MapPin, Calendar, Download,
  ExternalLink, Eye, CheckCircle, XCircle, Clock, ShieldOff, AlertTriangle, Trash2, Key
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

interface UserDetail {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  id_number: string;
  kyc_status: string;
  kyc_submitted_at: string | null;
  kyc_reviewed_at: string | null;
  kyc_rejection_reason: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  created_at: string;
  updated_at: string;
}

const AdminUserDetail = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [ipAddresses, setIpAddresses] = useState<string[]>([]);
  const [chamas, setChamas] = useState<any[]>([]);
  const [mchangos, setMchangos] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [contributions, setContributions] = useState<any[]>([]);
const [withdrawals, setWithdrawals] = useState<any[]>([]);
const [frontSignedUrl, setFrontSignedUrl] = useState<string | null>(null);
const [backSignedUrl, setBackSignedUrl] = useState<string | null>(null);
  const [has2FA, setHas2FA] = useState(false);
  const [resetting2FA, setResetting2FA] = useState(false);
  const [show2FAResetConfirm, setShow2FAResetConfirm] = useState(false);
  useEffect(() => {
    if (userId) {
      loadUserDetails();
    }
  }, [userId]);

  // Build signed URLs for KYC documents when URLs change
  useEffect(() => {
    const extractPath = (fullUrl: string) => {
      const match = fullUrl?.match(/id-documents\/(.+)$/);
      return match ? match[1] : fullUrl;
    };

    const build = async () => {
      try {
        setFrontSignedUrl(null);
        setBackSignedUrl(null);
        if (!user) return;

        if (user.id_front_url) {
          const path = extractPath(user.id_front_url);
          const { data } = await supabase.storage.from('id-documents').createSignedUrl(path, 3600);
          if (data?.signedUrl) setFrontSignedUrl(data.signedUrl);
        }
        if (user.id_back_url) {
          const path = extractPath(user.id_back_url);
          const { data } = await supabase.storage.from('id-documents').createSignedUrl(path, 3600);
          if (data?.signedUrl) setBackSignedUrl(data.signedUrl);
        }
      } catch (e) {
        console.error('Error creating signed URLs', e);
      }
    };

    build();
  }, [user?.id_front_url, user?.id_back_url]);

  const loadUserDetails = async () => {
    try {
      setLoading(true);

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setUser(profile);

      // Fetch user roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      setUserRoles(roles?.map(r => r.role) || []);

      // Fetch IP addresses from audit logs
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('ip_address')
        .eq('user_id', userId)
        .not('ip_address', 'is', null)
        .order('created_at', { ascending: false });
      
      const uniqueIps = [...new Set(auditLogs?.map(log => log.ip_address).filter(Boolean))];
      setIpAddresses(uniqueIps as string[]);

      // Fetch user's chamas (as member)
      const { data: userChamas } = await supabase
        .from('chama_members')
        .select(`
          *,
          chama:chama_id (
            id,
            name,
            slug,
            contribution_amount,
            status,
            created_at
          )
        `)
        .eq('user_id', userId);
      setChamas(userChamas || []);

      // Fetch user's mchangos (created by user)
      const { data: userMchangos } = await supabase
        .from('mchango')
        .select('*')
        .eq('created_by', userId);
      setMchangos(userMchangos || []);

      // Fetch transactions
      const { data: userTransactions } = await supabase
        .from('transactions')
        .select(`
          *,
          mchango:mchango_id (title, slug),
          chama:chama_id (name, slug)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      setTransactions(userTransactions || []);

      // Fetch contributions
      const { data: userContributions } = await supabase
        .from('contributions')
        .select(`
          *,
          chama:chama_id (name, slug),
          member:member_id (member_code)
        `)
        .eq('paid_by_member_id', userId)
        .order('contribution_date', { ascending: false })
        .limit(50);
      setContributions(userContributions || []);

      // Fetch withdrawals
      const { data: userWithdrawals } = await supabase
        .from('withdrawals')
        .select(`
          *,
          mchango:mchango_id (title, slug),
          chama:chama_id (name, slug)
        `)
        .eq('requested_by', userId)
        .order('requested_at', { ascending: false });
      setWithdrawals(userWithdrawals || []);

      // Check if user has 2FA enabled
      const { data: totpData } = await supabase
        .from('totp_secrets')
        .select('is_enabled')
        .eq('user_id', userId!)
        .maybeSingle();
      setHas2FA(!!totpData?.is_enabled);

    } catch (error: any) {
      console.error('Error loading user details:', error);
      toast({
        title: "Error",
        description: "Failed to load user details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadDocument = async (url: string, filename: string) => {
    try {
      // Extract path from full URL (format: https://.../storage/v1/object/public/id-documents/{user_id}/file.jpg)
      const extractPath = (fullUrl: string) => {
        const match = fullUrl.match(/id-documents\/(.+)$/);
        return match ? match[1] : fullUrl;
      };

      const path = extractPath(url);
      const { data, error } = await supabase.storage
        .from('id-documents')
        .download(path);

      if (error) throw error;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(data);
      link.download = filename;
      link.click();

      toast({
        title: "Success",
        description: "Document downloaded",
      });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to download document",
        variant: "destructive",
      });
    }
  };

  const reset2FA = async () => {
    if (!userId) return;
    setResetting2FA(true);
    try {
      const { error } = await supabase
        .from('totp_secrets')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      setHas2FA(false);
      setShow2FAResetConfirm(false);
      toast({
        title: "2FA Reset",
        description: "Two-factor authentication has been reset for this user. They can set it up again on their next login.",
      });
    } catch (error: any) {
      console.error('Error resetting 2FA:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset 2FA",
        variant: "destructive",
      });
    } finally {
      setResetting2FA(false);
    }
  };

  const getKycStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">User not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{user.full_name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex gap-2">
            {userRoles.includes('admin') && (
              <Badge variant="default">
                <Shield className="h-3 w-3 mr-1" />
                Admin
              </Badge>
            )}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {getKycStatusIcon(user.kyc_status)}
                <span className="text-lg font-bold capitalize">{user.kyc_status}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Chamas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{chamas.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{mchangos.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{transactions.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Information Tabs */}
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="chamas">Chamas</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="contributions">Contributions</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Full Name
                      </p>
                      <p className="font-medium">{user.full_name}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email
                      </p>
                      <p className="font-medium">{user.email}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Phone Number (Payout Method)
                      </p>
                      <p className="font-medium">{user.phone}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        To change: Customer must submit request via Profile → Payment Dashboard
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        ID Number
                      </p>
                      <p className="font-medium">{user.id_number}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Joined
                      </p>
                      <p className="font-medium">{format(new Date(user.created_at), "PPP")}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Last Updated
                      </p>
                      <p className="font-medium">{format(new Date(user.updated_at), "PPP")}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Signup IP
                      </p>
                      <p className="font-mono text-sm bg-muted px-2 py-1 rounded inline-block">
                        {(user as any).signup_ip || 'Not recorded'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Last Login IP
                      </p>
                      <p className="font-mono text-sm bg-muted px-2 py-1 rounded inline-block">
                        {(user as any).last_login_ip || 'Not recorded'}
                      </p>
                      {(user as any).last_login_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date((user as any).last_login_at), "PPP 'at' p")}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Historical IPs ({ipAddresses.length})
                      </p>
                      <div className="space-y-1 mt-2">
                        {ipAddresses.slice(0, 5).map((ip, index) => (
                          <p key={index} className="font-mono text-sm bg-muted px-2 py-1 rounded">
                            {ip}
                          </p>
                        ))}
                        {ipAddresses.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            +{ipAddresses.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>

                    {user.kyc_status === 'rejected' && user.kyc_rejection_reason && (
                      <div>
                        <p className="text-sm text-destructive font-medium">Rejection Reason</p>
                        <p className="text-sm">{user.kyc_rejection_reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>KYC Documents</CardTitle>
                <CardDescription>
                  ID verification documents uploaded by user
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {user.kyc_submitted_at && (
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm">
                      <span className="font-medium">Submitted:</span>{" "}
                      {format(new Date(user.kyc_submitted_at), "PPP 'at' p")}
                    </p>
                    {user.kyc_reviewed_at && (
                      <p className="text-sm mt-1">
                        <span className="font-medium">Reviewed:</span>{" "}
                        {format(new Date(user.kyc_reviewed_at), "PPP 'at' p")}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {user.id_front_url && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">ID Front</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <img
                          src={frontSignedUrl || ''}
                          alt="ID Front"
                          className="w-full h-48 object-cover rounded-lg border"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!frontSignedUrl}
                            onClick={() => frontSignedUrl && window.open(frontSignedUrl, '_blank')}
                            className="flex-1"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadDocument(user.id_front_url!, 'id_front.jpg')}
                            className="flex-1"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {user.id_back_url && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">ID Back</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <img
                          src={backSignedUrl || ''}
                          alt="ID Back"
                          className="w-full h-48 object-cover rounded-lg border"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!backSignedUrl}
                            onClick={() => backSignedUrl && window.open(backSignedUrl, '_blank')}
                            className="flex-1"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadDocument(user.id_back_url!, 'id_back.jpg')}
                            className="flex-1"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {!user.id_front_url && !user.id_back_url && (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No documents uploaded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Chamas Tab */}
          <TabsContent value="chamas">
            <Card>
              <CardHeader>
                <CardTitle>Chama Memberships</CardTitle>
                <CardDescription>
                  All chamas this user is a member of ({chamas.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chamas.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Not a member of any chamas yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chamas.map((membership) => (
                      <div
                        key={membership.id}
                        className="p-4 border rounded-lg space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{membership.chama?.name}</p>
                              {membership.is_manager && (
                                <Badge variant="default" className="text-xs">Manager</Badge>
                              )}
                              <Badge variant={membership.approval_status === 'approved' ? 'outline' : 'secondary'}>
                                {membership.approval_status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Member Code: <code>{membership.member_code}</code> • 
                              Position: #{membership.order_index || '-'} • 
                              Joined {format(new Date(membership.joined_at), "MMM d, yyyy")}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => navigate(`/admin/chama/${membership.chama?.id}`)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Admin View
                            </Button>
                          </div>
                        </div>
                        
                        {/* Member Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t">
                          <div>
                            <p className="text-xs text-muted-foreground">Total Contributed</p>
                            <p className="font-medium">KES {Number(membership.total_contributed || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Missed Payments</p>
                            <p className="font-medium">
                              {membership.missed_payments_count > 0 ? (
                                <Badge variant="destructive">{membership.missed_payments_count}</Badge>
                              ) : (
                                <Badge variant="outline">0</Badge>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Credit Balance</p>
                            <p className="font-medium">
                              {Number(membership.balance_credit || 0) > 0 ? (
                                <span className="text-green-600">+KES {Number(membership.balance_credit).toLocaleString()}</span>
                              ) : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Deficit</p>
                            <p className="font-medium">
                              {Number(membership.balance_deficit || 0) > 0 ? (
                                <span className="text-red-600">-KES {Number(membership.balance_deficit).toLocaleString()}</span>
                              ) : '-'}
                            </p>
                          </div>
                        </div>

                        {/* Additional Status Indicators */}
                        <div className="flex flex-wrap gap-2">
                          {membership.first_payment_completed && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              First Payment Done
                            </Badge>
                          )}
                          {!membership.first_payment_completed && membership.approval_status === 'approved' && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600">
                              <Clock className="h-3 w-3 mr-1" />
                              Awaiting First Payment
                            </Badge>
                          )}
                          {membership.requires_admin_verification && (
                            <Badge variant="destructive">
                              Needs Admin Verification
                            </Badge>
                          )}
                          {membership.status === 'removed' && (
                            <Badge variant="destructive">Removed</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <Card>
              <CardHeader>
                <CardTitle>Created Campaigns</CardTitle>
                <CardDescription>
                  Fundraising campaigns created by this user ({mchangos.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mchangos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No campaigns created yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mchangos.map((mchango) => (
                      <div
                        key={mchango.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{mchango.title}</p>
                            <Badge variant={mchango.status === 'active' ? 'default' : 'secondary'}>
                              {mchango.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            KES {Number(mchango.current_amount).toLocaleString()} / 
                            {Number(mchango.target_amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Created {format(new Date(mchango.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/mchango/${mchango.slug}`)}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>
                  All transactions made by this user ({transactions.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">KES {Number(tx.amount).toLocaleString()}</p>
                            <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                              {tx.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tx.transaction_type} • {tx.payment_reference}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.created_at), "PPP 'at' p")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contributions Tab */}
          <TabsContent value="contributions">
            <Card>
              <CardHeader>
                <CardTitle>Chama Contributions</CardTitle>
                <CardDescription>
                  Payments made to chamas ({contributions.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {contributions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No contributions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contributions.map((contrib) => (
                      <div
                        key={contrib.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">KES {Number(contrib.amount).toLocaleString()}</p>
                            <Badge variant={contrib.status === 'completed' ? 'default' : 'secondary'}>
                              {contrib.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {contrib.chama?.name} • {contrib.member?.member_code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(contrib.contribution_date), "PPP 'at' p")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card>
              <CardHeader>
                <CardTitle>Withdrawal Requests</CardTitle>
                <CardDescription>
                  All withdrawal requests made ({withdrawals.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {withdrawals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No withdrawal requests</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {withdrawals.map((withdrawal) => (
                      <div
                        key={withdrawal.id}
                        className="p-4 border rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium">KES {Number(withdrawal.amount).toLocaleString()}</p>
                              <Badge variant={
                                withdrawal.status === 'completed' ? 'default' :
                                withdrawal.status === 'rejected' ? 'destructive' : 'secondary'
                              }>
                                {withdrawal.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Commission: KES {Number(withdrawal.commission_amount).toLocaleString()} • 
                              Net: KES {Number(withdrawal.net_amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Requested {format(new Date(withdrawal.requested_at), "PPP 'at' p")}
                            </p>
                            {withdrawal.notes && (
                              <p className="text-sm mt-2 italic">{withdrawal.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Manage security features for this user
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 2FA Status */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${has2FA ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                        {has2FA ? (
                          <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <ShieldOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">Two-Factor Authentication (2FA)</p>
                        <p className="text-sm text-muted-foreground">
                          {has2FA ? 'Enabled — User has TOTP 2FA active' : 'Not enabled — User has not set up 2FA'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={has2FA ? 'default' : 'secondary'}>
                      {has2FA ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {has2FA && (
                    <div className="pt-3 border-t">
                      <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Reset 2FA for this user</p>
                          <p className="text-sm text-muted-foreground">
                            Use this if the customer has lost access to their authenticator app and backup codes. 
                            This will remove their 2FA setup completely, allowing them to set it up again.
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShow2FAResetConfirm(true)}
                            disabled={resetting2FA}
                          >
                            {resetting2FA ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <ShieldOff className="h-4 w-4 mr-2" />
                            )}
                            Reset 2FA
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 2FA Reset Confirmation Dialog */}
        <AlertDialog open={show2FAResetConfirm} onOpenChange={setShow2FAResetConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Reset Two-Factor Authentication
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  You are about to reset 2FA for <strong>{user?.full_name}</strong> ({user?.email}).
                </p>
                <p>
                  This will delete their TOTP secret and backup codes. They will need to set up 2FA again from their profile settings.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={reset2FA}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {resetting2FA ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminUserDetail;
