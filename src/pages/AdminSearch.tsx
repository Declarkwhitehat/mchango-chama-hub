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

      const allGroups = (chamaMemberships || []).map(m => ({ ...m, groupType: 'chama' }));

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
                        {membership.chama?.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Chama - {membership.member_code}
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
                    {memberData.member_code || 'N/A'}
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
                    Chama
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
                    {memberData.chama?.name || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Code: {memberData.chama?.group_code || 'N/A'}
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
                    {formatCurrency(memberData.balance_credit || 0)}
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
                      Chama Group Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                        <p className="text-base">{formatCurrency(memberData.chama?.contribution_amount || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Frequency</p>
                        <p className="text-base capitalize">{memberData.chama?.contribution_frequency || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Group Status</p>
                        <Badge variant={memberData.chama?.status === 'active' ? 'default' : 'secondary'}>
                          {memberData.chama?.status || 'N/A'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Max Members</p>
                        <p className="text-base">{memberData.chama?.max_members || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Payment Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Payout Order</p>
                        <p className="text-2xl font-bold">{memberData.payout_order || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Payment Details</p>
                        <Badge variant={memberData.profiles?.payment_details_completed ? 'default' : 'secondary'}>
                          {memberData.profiles?.payment_details_completed ? 'Completed' : 'Pending'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Balance Credit</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(memberData.balance_credit || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Balance Deficit</p>
                        <p className="text-xl font-bold text-destructive">
                          {formatCurrency(memberData.balance_deficit || 0)}
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
                      Recent Transactions
                    </CardTitle>
                    <CardDescription>
                      Transaction history will be displayed here
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Transaction history coming soon</p>
                    </div>
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
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Phone Number</p>
                        <p className="text-base">{memberData.profiles?.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Email Address</p>
                        <p className="text-base">{memberData.profiles?.email || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* User with no memberships */}
        {!loading && memberData?.noMemberships && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                User Found - No Memberships
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  <p className="text-sm font-medium text-muted-foreground">KYC Status</p>
                  <Badge variant={memberData.profiles?.kyc_status === 'approved' ? 'default' : 'secondary'}>
                    {memberData.profiles?.kyc_status || 'N/A'}
                  </Badge>
                </div>
              </div>
              <Separator className="my-4" />
              <p className="text-muted-foreground text-sm">
                This user is registered but has not joined any Chama groups yet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* No results state */}
        {!loading && !memberData && (
          <Card className="text-center py-12">
            <CardContent>
              <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Search for Members</h3>
              <p className="text-muted-foreground">
                Enter a member code, phone number, email, name, or ID number to search
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
