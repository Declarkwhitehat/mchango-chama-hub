import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SearchBar } from "@/components/admin/SearchBar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Search, User, Users, DollarSign, CreditCard, FileText, AlertCircle,
  Phone, Mail, IdCard, Shield, Clock, ArrowUpDown, Image, Activity,
  Wallet, CheckCircle2, XCircle, ChevronRight, Smartphone
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface MemberActivity {
  profile: any;
  chama_memberships: any[];
  welfare_memberships: any[];
  payment_methods: any[];
  withdrawals: any[];
  audit_logs: any[];
  payments: any[];
}

export default function AdminSearch() {
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [activity, setActivity] = useState<MemberActivity | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const formatCurrency = (amount: number | null) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat('en-KE', {
      style: 'currency', currency: 'KES', minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSearch = async (query: string, type: string) => {
    setLoading(true);
    setSearchResults(null);
    setActivity(null);
    setSelectedUserId(null);

    try {
      const { data, error } = await supabase.functions.invoke('admin-search', {
        body: { query: query.trim(), type }
      });
      if (error) throw error;

      const results = data?.data;
      if (!results) throw new Error('No data returned');

      // If exactly one user found, auto-load activity
      if (results.users?.length === 1 && !results.members?.length) {
        setSearchResults(results);
        await loadActivity(results.users[0].id);
      } else if (results.members?.length === 1 && !results.users?.length) {
        const member = results.members[0];
        const userId = member.user_id;
        if (userId) {
          setSearchResults(results);
          await loadActivity(userId);
        } else {
          setSearchResults(results);
        }
      } else if (results.users?.length || results.members?.length) {
        setSearchResults(results);
      } else {
        toast({ title: "No Results", description: `No results found for "${query}"`, variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({ title: "Search Failed", description: error.message || "Failed to search", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async (userId: string) => {
    setActivityLoading(true);
    setSelectedUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-member-activity', {
        body: { user_id: userId }
      });
      if (error) throw error;
      if (data?.data) {
        setActivity(data.data);
      }
    } catch (error: any) {
      console.error('Activity error:', error);
      toast({ title: "Error", description: "Failed to load member activity", variant: "destructive" });
    } finally {
      setActivityLoading(false);
    }
  };

  const handleClear = () => {
    setSearchResults(null);
    setActivity(null);
    setSelectedUserId(null);
  };

  const mpesaNumber = activity?.payment_methods?.find(
    (pm: any) => pm.method_type === 'mpesa'
  )?.phone_number;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': case 'active': case 'approved': return 'default';
      case 'pending': case 'pending_approval': return 'secondary';
      case 'failed': case 'rejected': case 'removed': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Member Search</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Search by member code, phone, email, name, or ID number across all groups
          </p>
        </div>

        {/* Search */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" />
              Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SearchBar onSearch={handleSearch} onClear={handleClear} isLoading={loading} />
          </CardContent>
        </Card>

        {/* Loading */}
        {(loading || activityLoading) && (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        )}

        {/* Search results list (multiple users/members) */}
        {searchResults && !activity && !activityLoading && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Results</CardTitle>
              <CardDescription>Select a user to view their full activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(searchResults.users || []).map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => loadActivity(u.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{u.phone || u.email || 'No contact'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusColor(u.kyc_status)}>{u.kyc_status || 'N/A'}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
                {(searchResults.members || []).map((m: any) => (
                  <button
                    key={m.id}
                    onClick={() => m.user_id && loadActivity(m.user_id)}
                    disabled={!m.user_id}
                    className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-accent/50 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{m.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.member_code} · {m.source_type === 'welfare' ? m.welfares?.name : m.chama?.name || 'Unknown group'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{m.source_type || 'chama'}</Badge>
                      <Badge variant={getStatusColor(m.status)}>{m.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Full Activity View */}
        {activity && !activityLoading && (
          <>
            {/* Profile Header Card */}
            <Card className="border-primary/20">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold">{activity.profile?.full_name || 'Unknown'}</h2>
                      <Badge variant={getStatusColor(activity.profile?.kyc_status)}>
                        <Shield className="h-3 w-3 mr-1" />
                        KYC: {activity.profile?.kyc_status || 'N/A'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{activity.profile?.phone || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{activity.profile?.email || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IdCard className="h-4 w-4 flex-shrink-0" />
                        <span>ID: {activity.profile?.id_number || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Smartphone className="h-4 w-4 flex-shrink-0" />
                        <span>M-Pesa: {mpesaNumber || 'N/A'}</span>
                      </div>
                    </div>
                    {activity.profile?.created_at && (
                      <p className="text-xs text-muted-foreground">
                        Registered: {format(new Date(activity.profile.created_at), 'PPP')}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleClear}>
                    New Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Users className="h-3.5 w-3.5" /> Groups
                  </div>
                  <p className="text-2xl font-bold">
                    {(activity.chama_memberships?.length || 0) + (activity.welfare_memberships?.length || 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3.5 w-3.5" /> Payments
                  </div>
                  <p className="text-2xl font-bold">{activity.payments?.length || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Wallet className="h-3.5 w-3.5" /> Withdrawals
                  </div>
                  <p className="text-2xl font-bold">{activity.withdrawals?.length || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Activity className="h-3.5 w-3.5" /> Audit Events
                  </div>
                  <p className="text-2xl font-bold">{activity.audit_logs?.length || 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabbed Detail */}
            <Tabs defaultValue="memberships" className="w-full">
              <TabsList>
                <TabsTrigger value="memberships">Memberships</TabsTrigger>
                <TabsTrigger value="payments">Payments & Withdrawals</TabsTrigger>
                <TabsTrigger value="activity">Activity Log</TabsTrigger>
                <TabsTrigger value="documents">ID Documents</TabsTrigger>
              </TabsList>

              {/* Memberships Tab */}
              <TabsContent value="memberships" className="space-y-4">
                {activity.chama_memberships?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Chama Memberships</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Group</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead>Joined</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activity.chama_memberships.map((m: any) => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium">{m.chama?.name || '—'}</TableCell>
                              <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.member_code}</code></TableCell>
                              <TableCell>
                                <Badge variant={m.is_manager ? 'default' : 'secondary'}>
                                  {m.is_manager ? 'Manager' : 'Member'}
                                </Badge>
                              </TableCell>
                              <TableCell><Badge variant={getStatusColor(m.status)}>{m.status}</Badge></TableCell>
                              <TableCell className="text-right">
                                <span className="text-green-600 dark:text-green-400">{formatCurrency(m.balance_credit || 0)}</span>
                                {m.balance_deficit > 0 && (
                                  <span className="block text-xs text-destructive">-{formatCurrency(m.balance_deficit)}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {m.joined_at ? format(new Date(m.joined_at), 'PP') : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {activity.welfare_memberships?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Welfare Memberships</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Welfare</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Contributed</TableHead>
                            <TableHead>Joined</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activity.welfare_memberships.map((m: any) => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium">{m.welfares?.name || '—'}</TableCell>
                              <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.member_code || '—'}</code></TableCell>
                              <TableCell><Badge variant={m.role === 'chairman' ? 'default' : 'secondary'}>{m.role}</Badge></TableCell>
                              <TableCell><Badge variant={getStatusColor(m.status)}>{m.status}</Badge></TableCell>
                              <TableCell className="text-right">{formatCurrency(m.total_contributed || 0)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {m.joined_at ? format(new Date(m.joined_at), 'PP') : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {!activity.chama_memberships?.length && !activity.welfare_memberships?.length && (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>No group memberships found</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Payments & Withdrawals Tab */}
              <TabsContent value="payments" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Recent Payments ({activity.payments?.length || 0})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activity.payments?.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Receipt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activity.payments.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs">{format(new Date(p.created_at), 'PP p')}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{p.type}</Badge>
                              </TableCell>
                              <TableCell className="font-medium text-sm">{p.source_name}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                              <TableCell><Badge variant={getStatusColor(p.status)}>{p.status}</Badge></TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{p.mpesa_receipt || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No payments found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Recent Withdrawals ({activity.withdrawals?.length || 0})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activity.withdrawals?.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Commission</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activity.withdrawals.map((w: any) => {
                            const sourceName = w.chama?.name || w.mchango?.title || w.welfares?.name || w.organizations?.name || 'Unknown';
                            return (
                              <TableRow key={w.id}>
                                <TableCell className="text-xs">{format(new Date(w.created_at), 'PP p')}</TableCell>
                                <TableCell className="font-medium text-sm">{sourceName}</TableCell>
                                <TableCell className="text-right">{formatCurrency(w.amount)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{formatCurrency(w.commission_amount)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(w.net_amount)}</TableCell>
                                <TableCell><Badge variant={getStatusColor(w.status)}>{w.status}</Badge></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No withdrawals found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Activity Log Tab */}
              <TabsContent value="activity">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Activity Log ({activity.audit_logs?.length || 0})</CardTitle>
                    <CardDescription>Full audit trail including phone number changes, profile updates, and all actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activity.audit_logs?.length > 0 ? (
                      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                        {activity.audit_logs.map((log: any) => {
                          const isPhoneChange = log.table_name === 'profiles' &&
                            (log.old_values?.phone !== log.new_values?.phone) &&
                            log.old_values?.phone != null;

                          return (
                            <div key={log.id} className={`flex gap-3 p-3 rounded-lg border ${isPhoneChange ? 'border-yellow-500/30 bg-yellow-500/5' : 'bg-card'}`}>
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                isPhoneChange ? 'bg-yellow-500/10' : 'bg-muted'
                              }`}>
                                {isPhoneChange ? (
                                  <Phone className="h-4 w-4 text-yellow-600" />
                                ) : log.action === 'INSERT' ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : log.action === 'DELETE' ? (
                                  <XCircle className="h-4 w-4 text-destructive" />
                                ) : (
                                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{log.action}</Badge>
                                  <span className="text-sm font-medium">{log.table_name}</span>
                                  {isPhoneChange && (
                                    <Badge variant="secondary" className="text-xs">Phone Changed</Badge>
                                  )}
                                </div>
                                {isPhoneChange && (
                                  <p className="text-xs mt-1">
                                    <span className="text-muted-foreground">From:</span>{' '}
                                    <code className="bg-muted px-1 rounded">{log.old_values?.phone}</code>
                                    {' → '}
                                    <code className="bg-muted px-1 rounded">{log.new_values?.phone}</code>
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(log.created_at), 'PPP p')}
                                  {log.ip_address && (
                                    <span className="ml-2">IP: {log.ip_address}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No audit logs found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ID Documents Tab */}
              <TabsContent value="documents">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      ID Documents
                    </CardTitle>
                    <CardDescription>
                      KYC Status: <Badge variant={getStatusColor(activity.profile?.kyc_status)}>{activity.profile?.kyc_status || 'N/A'}</Badge>
                      {activity.profile?.kyc_rejection_reason && (
                        <span className="ml-2 text-destructive text-xs">
                          Rejection reason: {activity.profile.kyc_rejection_reason}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm font-medium mb-2 text-muted-foreground">ID Front</p>
                        {activity.profile?.id_front_url ? (
                          <img
                            src={activity.profile.id_front_url}
                            alt="ID Front"
                            className="w-full rounded-lg border object-contain max-h-72 bg-muted"
                          />
                        ) : (
                          <div className="h-48 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                              <Image className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">Not uploaded</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2 text-muted-foreground">ID Back</p>
                        {activity.profile?.id_back_url ? (
                          <img
                            src={activity.profile.id_back_url}
                            alt="ID Back"
                            className="w-full rounded-lg border object-contain max-h-72 bg-muted"
                          />
                        ) : (
                          <div className="h-48 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                              <Image className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">Not uploaded</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Full Name</p>
                        <p className="font-medium">{activity.profile?.full_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">ID Number</p>
                        <p className="font-medium">{activity.profile?.id_number || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Payment Details</p>
                        <Badge variant={activity.profile?.payment_details_completed ? 'default' : 'secondary'}>
                          {activity.profile?.payment_details_completed ? 'Completed' : 'Incomplete'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">2FA Status</p>
                        <Badge variant={activity.profile?.two_factor_enabled ? 'default' : 'secondary'}>
                          {activity.profile?.two_factor_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Empty state */}
        {!loading && !activityLoading && !searchResults && !activity && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-1">Search for a member</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enter a member code, phone number, email, name, or ID number to view their complete activity across all groups.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
