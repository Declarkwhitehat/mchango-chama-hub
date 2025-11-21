import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, User, Users, PiggyBank, DollarSign, CreditCard, FileText, TrendingDown } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function AdminSearch() {
  const [memberCode, setMemberCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [memberData, setMemberData] = useState<any>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!memberCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter a member code (e.g., FDE1)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-search', {
        body: { query: memberCode.trim(), type: 'member_code' }
      });

      if (error) throw error;

      if (data?.success && data?.data?.members?.[0]) {
        setMemberData(data.data.members[0]);
      } else {
        toast({
          title: "Not Found",
          description: `No member found with code: ${memberCode}`,
          variant: "destructive",
        });
        setMemberData(null);
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for member",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Member Search</h1>
          <p className="text-muted-foreground">Search for comprehensive member information using member code</p>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search by Member Code
            </CardTitle>
            <CardDescription>
              Enter a member code (e.g., FDE1, ABC2) to view complete member profile and activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter member code (e.g., FDE1)"
                value={memberCode}
                onChange={(e) => setMemberCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="max-w-md"
              />
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? "Searching..." : "Search"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Member Data Display */}
        {memberData && (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Member Code</CardTitle>
                  <User className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{memberData.member_code}</div>
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Group</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{memberData.chama?.name || 'N/A'}</div>
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
                    <Separator />
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
                      <Separator />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Payment records and transaction history would be displayed here with full details
                          from the member_cycle_payments and contributions tables.
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
                      Complete transaction history including deposits, withdrawals, and transfers would be
                      displayed here from the transactions table.
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
                          {memberData.approval_status || 'Pending'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {!memberData && !loading && (
          <Card className="text-center py-12">
            <CardContent>
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">No Member Selected</p>
              <p className="text-sm text-muted-foreground">
                Enter a member code above to search for comprehensive member information
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
