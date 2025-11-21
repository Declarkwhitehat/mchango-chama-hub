import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SearchBar } from "@/components/admin/SearchBar";
import { Search, User, Users, DollarSign, CreditCard, FileText, AlertCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminSearch() {
  const [loading, setLoading] = useState(false);
  const [memberData, setMemberData] = useState<any>(null);
  const [allMemberships, setAllMemberships] = useState<any[]>([]);
  const [selectedMembershipIndex, setSelectedMembershipIndex] = useState(0);
  const { toast } = useToast();

  const handleSearch = async (query: string, type: string) => {
    setLoading(true);
    setMemberData(null);
    setAllMemberships([]);
    
    try {
      const { data, error } = await supabase.functions.invoke('admin-search', {
        body: { query: query.trim(), type: type }
      });

      if (error) throw error;

      console.log('Search results:', data);

      // Handle member_code search
      if (type === 'member_code' && data?.data?.members?.[0]) {
        setMemberData(data.data.members[0]);
        setAllMemberships([data.data.members[0]]);
      } 
      // Handle user-based searches (phone, email, name, id_number)
      else if (['phone', 'email', 'user', 'id_number'].includes(type) && data?.data?.users?.[0]) {
        const userId = data.data.users[0].id;
        await fetchAllMemberships(userId, data.data.users[0]);
      } 
      // Handle 'all' search
      else if (type === 'all') {
        if (data?.data?.members?.[0]) {
          setMemberData(data.data.members[0]);
          setAllMemberships([data.data.members[0]]);
        } else if (data?.data?.users?.[0]) {
          const userId = data.data.users[0].id;
          await fetchAllMemberships(userId, data.data.users[0]);
        } else {
          toast({
            title: "No Results",
            description: `No results found for "${query}"`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "No Results",
          description: `No results found for "${query}". Try different search criteria.`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      let errorMessage = "Failed to search. Please try again.";
      
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        errorMessage = "Network error. Please check your connection.";
      } else if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
        errorMessage = "Access denied. Admin privileges required.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Search Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllMemberships = async (userId: string, userProfile: any) => {
    try {
      // Fetch all chama memberships
      const { data: chamaMemberships, error: chamaError } = await supabase
        .from('chama_members')
        .select(`
          *,
          profiles (
            full_name, 
            email, 
            phone, 
            id_number,
            kyc_status,
            payment_details_completed
          ),
          chama (
            name, 
            slug, 
            group_code,
            contribution_amount,
            contribution_frequency,
            status,
            max_members
          )
        `)
        .eq('user_id', userId);

      if (chamaError) {
        console.error('Error fetching chama memberships:', chamaError);
      }

      // Fetch all savings group memberships
      const { data: savingsMemberships, error: savingsError } = await supabase
        .from('saving_group_members')
        .select(`
          *,
          saving_groups (
            name,
            slug,
            group_code,
            monthly_target,
            saving_goal,
            status
          )
        `)
        .eq('user_id', userId);

      if (savingsError) {
        console.error('Error fetching savings memberships:', savingsError);
      }

      const allGroups = [
        ...(chamaMemberships || []).map(m => ({ ...m, groupType: 'chama' })),
        ...(savingsMemberships || []).map(m => ({ ...m, groupType: 'savings' }))
      ];

      if (allGroups.length > 0) {
        // Enhance each membership with user profile
        const enhancedMemberships = allGroups.map(m => ({
          ...m,
          profiles: (m as any).profiles || userProfile
        }));
        
        setAllMemberships(enhancedMemberships);
        setMemberData(enhancedMemberships[0]);
        setSelectedMembershipIndex(0);

        if (allGroups.length > 1) {
          toast({
            title: "Multiple Memberships Found",
            description: `Found ${allGroups.length} group memberships for this user`,
          });
        }
      } else {
        // User found but no memberships
        setMemberData({ profiles: userProfile, noMemberships: true });
        toast({
          title: "User Found",
          description: "User has no active group memberships",
        });
      }
    } catch (error: any) {
      console.error('Error fetching memberships:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user memberships",
        variant: "destructive",
      });
    }
  };

  const handleClear = () => {
    setMemberData(null);
    setAllMemberships([]);
    setSelectedMembershipIndex(0);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const currentMembership = allMemberships[selectedMembershipIndex];

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Member Search</h1>
          <p className="text-muted-foreground">
            Search by member code, phone, email, name, or ID number
          </p>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Advanced Member Search
            </CardTitle>
            <CardDescription>
              Search using multiple criteria: member code (e.g., FDE1), phone (0712345678), email, name, or ID number
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SearchBar 
              onSearch={handleSearch} 
              onClear={handleClear}
              isLoading={loading}
            />
            <div className="mt-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">Search Tips:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Member Code: FDE1, ABC2, XYZ3</li>
                <li>Phone: 0712345678, +254712345678, 712345678</li>
                <li>Email: user@example.com</li>
                <li>Name: John Doe, Jane</li>
                <li>ID Number: 12345678</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Multiple Memberships Selector */}
        {!loading && allMemberships.length > 1 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Multiple Memberships ({allMemberships.length})
              </CardTitle>
              <CardDescription>
                This user belongs to {allMemberships.length} groups. Select one to view details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {allMemberships.map((membership, index) => (
                  <Button
                    key={index}
                    variant={selectedMembershipIndex === index ? "default" : "outline"}
                    onClick={() => {
                      setSelectedMembershipIndex(index);
                      setMemberData(membership);
                    }}
                    className="justify-start h-auto py-3"
                  >
                    <div className="text-left">
                      <div className="font-semibold">
                        {membership.groupType === 'chama' 
                          ? membership.chama?.name 
                          : membership.saving_groups?.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {membership.groupType === 'chama' ? 'Chama' : 'Savings Group'} - {membership.member_code || membership.unique_member_id}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Member Data Display */}
        {!loading && memberData && !memberData.noMemberships && (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Member Code</CardTitle>
                  <User className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {memberData.member_code || memberData.unique_member_id || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {memberData.profiles?.full_name || 'N/A'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Status</CardTitle>
                  <Badge variant={memberData.status === 'active' ? 'default' : 'secondary'}>
                    {memberData.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-sm">
                    {memberData.is_manager ? (
                      <Badge variant="outline">Manager</Badge>
                    ) : (
                      <Badge variant="secondary">Member</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {memberData.groupType === 'chama' ? 'Chama' : 'Savings Group'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Group</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold truncate">
                    {memberData.groupType === 'chama' 
                      ? memberData.chama?.name 
                      : memberData.saving_groups?.name || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Code: {memberData.groupType === 'chama' 
                      ? memberData.chama?.group_code 
                      : memberData.saving_groups?.group_code || 'N/A'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Balance</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(
                      memberData.groupType === 'chama' 
                        ? (memberData.balance_credit || 0)
                        : (memberData.current_savings || 0)
                    )}
                  </div>
                  {memberData.balance_deficit > 0 && (
                    <p className="text-xs text-destructive">
                      Deficit: {formatCurrency(memberData.balance_deficit)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed Information Tabs */}
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="group">Group Info</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Personal Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                        <p className="text-base">{memberData.profiles?.full_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email</p>
                        <p className="text-base">{memberData.profiles?.email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Phone</p>
                        <p className="text-base">{memberData.profiles?.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">ID Number</p>
                        <p className="text-base">{memberData.profiles?.id_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">KYC Status</p>
                        <Badge variant={memberData.profiles?.kyc_status === 'approved' ? 'default' : 'secondary'}>
                          {memberData.profiles?.kyc_status || 'N/A'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                        <p className="text-base">
                          {memberData.joined_at ? format(new Date(memberData.joined_at), 'PPP') : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="group" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {memberData.groupType === 'chama' ? 'Chama' : 'Savings'} Group Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {memberData.groupType === 'chama' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Group Name</p>
                          <p className="text-base">{memberData.chama?.name || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Group Code</p>
                          <p className="text-base font-mono">{memberData.chama?.group_code || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Contribution Amount</p>
                          <p className="text-base">
                            {memberData.chama?.contribution_amount 
                              ? formatCurrency(memberData.chama.contribution_amount) 
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Frequency</p>
                          <p className="text-base capitalize">
                            {memberData.chama?.contribution_frequency?.replace('_', ' ') || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Group Status</p>
                          <Badge variant={memberData.chama?.status === 'active' ? 'default' : 'secondary'}>
                            {memberData.chama?.status || 'N/A'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Order Index</p>
                          <p className="text-base">#{memberData.order_index || 'N/A'}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Group Name</p>
                          <p className="text-base">{memberData.saving_groups?.name || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Group Code</p>
                          <p className="text-base font-mono">{memberData.saving_groups?.group_code || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Monthly Target</p>
                          <p className="text-base">
                            {memberData.saving_groups?.monthly_target 
                              ? formatCurrency(memberData.saving_groups.monthly_target) 
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Saving Goal</p>
                          <p className="text-base">
                            {memberData.saving_groups?.saving_goal 
                              ? formatCurrency(memberData.saving_groups.saving_goal) 
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Current Savings</p>
                          <p className="text-base">{formatCurrency(memberData.current_savings || 0)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Lifetime Deposits</p>
                          <p className="text-base">{formatCurrency(memberData.lifetime_deposits || 0)}</p>
                        </div>
                      </div>
                    )}
                    <Separator />
                    {memberData.groupType === 'chama' && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">Member Balance</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Credit Balance</p>
                            <p className="text-lg font-semibold text-green-600">
                              {formatCurrency(memberData.balance_credit || 0)}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Deficit Balance</p>
                            <p className="text-lg font-semibold text-destructive">
                              {formatCurrency(memberData.balance_deficit || 0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Payment History
                    </CardTitle>
                    <CardDescription>Recent payment activity and contribution records</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {memberData.groupType === 'chama' && (
                        <div className="grid grid-cols-3 gap-4">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Last Payment</p>
                            <p className="text-sm font-medium">
                              {memberData.last_payment_date 
                                ? format(new Date(memberData.last_payment_date), 'PPP')
                                : 'No payments yet'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Next Due Date</p>
                            <p className="text-sm font-medium">
                              {memberData.next_due_date 
                                ? format(new Date(memberData.next_due_date), 'PPP')
                                : 'N/A'}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Missed Payments</p>
                            <p className="text-sm font-medium text-destructive">
                              {memberData.missed_payments_count || 0}
                            </p>
                          </div>
                        </div>
                      )}
                      <Separator />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Detailed payment records and transaction history can be viewed by querying 
                          the member_cycle_payments, contributions, and saving_deposits tables.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="transactions" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Transaction History
                    </CardTitle>
                    <CardDescription>All financial transactions and activity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Complete transaction history including deposits, withdrawals, transfers, and loans 
                      can be retrieved from the transactions, withdrawals, and saving_group_loans tables.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contact" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email Address</p>
                        <p className="text-base">{memberData.profiles?.email || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Phone Number</p>
                        <p className="text-base">{memberData.profiles?.phone || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Account Status</p>
                        <Badge variant={memberData.approval_status === 'approved' ? 'default' : 'secondary'}>
                          {memberData.approval_status || memberData.status || 'Active'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* User Found But No Memberships */}
        {!loading && memberData?.noMemberships && (
          <Card className="text-center py-12">
            <CardContent className="space-y-4">
              <AlertCircle className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium mb-2">User Found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  This user exists but has no active group memberships
                </p>
                <div className="inline-block text-left bg-muted p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">User Details:</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Name:</span> {memberData.profiles?.full_name || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Email:</span> {memberData.profiles?.email || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Phone:</span> {memberData.profiles?.phone || 'N/A'}</p>
                    <p><span className="text-muted-foreground">ID:</span> {memberData.profiles?.id_number || 'N/A'}</p>
                    <p>
                      <span className="text-muted-foreground">KYC:</span>{' '}
                      <Badge variant={memberData.profiles?.kyc_status === 'approved' ? 'default' : 'secondary'}>
                        {memberData.profiles?.kyc_status || 'N/A'}
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Search Results */}
        {!memberData && !loading && (
          <Card className="text-center py-12">
            <CardContent>
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">No Results</p>
              <p className="text-sm text-muted-foreground">
                Use the search bar above to find members by code, phone, email, name, or ID number
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}