import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  TrendingUp,
  DollarSign,
  PieChart,
  PlayCircle,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Gift,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SavingsGroupInviteManager } from "./InviteManager";

interface ManagerDashboardProps {
  group: any;
  onRefresh: () => void;
}

export default function SavingsGroupManagerDashboard({
  group,
  onRefresh,
}: ManagerDashboardProps) {
  const { toast } = useToast();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startingGroup, setStartingGroup] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'start' | 'distribute' | null;
  }>({ open: false, type: null });

  useEffect(() => {
    fetchDashboardData();
  }, [group.id]);

  const fetchDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-crud/${group.id}/dashboard`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch dashboard data');
      }

      setDashboardData(result);
    } catch (error: any) {
      console.error('Error fetching dashboard:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load dashboard",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartGroup = async () => {
    setStartingGroup(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-crud/${group.id}/start`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start group');
      }

      toast({
        title: "Success!",
        description: `Group started with ${result.member_count} members. SMS notifications sent.`,
      });

      onRefresh();
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setStartingGroup(false);
      setConfirmDialog({ open: false, type: null });
    }
  };

  const handleApproveMember = async (memberId: string, approved: boolean) => {
    setActionLoading(memberId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-members/${group.id}/members/${memberId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ approved }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update member');
      }

      toast({
        title: "Success!",
        description: approved ? "Member approved" : "Member rejected",
      });

      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveLoan = async (loanId: string) => {
    setActionLoading(loanId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-loans/${loanId}/approve`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve loan');
      }

      toast({
        title: "Success!",
        description: "Loan approved and disbursed",
      });

      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCalculateProfits = async () => {
    setActionLoading('calculate-profits');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-profits/${group.id}/calculate-profits`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to calculate profits');
      }

      toast({
        title: "Success!",
        description: `Profits calculated: KES ${result.total_profit.toLocaleString()}`,
      });

      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDistributeProfits = async () => {
    setActionLoading('distribute-profits');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-profits/${group.id}/distribute-profits`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to distribute profits');
      }

      toast({
        title: "Success!",
        description: `Profits distributed to ${result.member_count} members. SMS notifications sent.`,
      });

      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setConfirmDialog({ open: false, type: null });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load dashboard data. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  const { members, loans, transactions, statistics } = dashboardData;
  const pendingMembers = members?.filter((m: any) => !m.is_approved) || [];
  const approvedMembers = members?.filter((m: any) => m.is_approved) || [];
  const pendingLoans = loans?.filter((l: any) => l.status === 'PENDING_APPROVAL') || [];
  const cycleEnded = group.cycle_end_date && new Date(group.cycle_end_date) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">{group.name}</h1>
          <p className="text-muted-foreground">Manager Dashboard</p>
          <Badge variant={group.started_at ? "default" : "secondary"} className="mt-2">
            {group.started_at ? "Active" : "Not Started"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {!group.started_at && (
            <Button
              onClick={() => setConfirmDialog({ open: true, type: 'start' })}
              disabled={startingGroup || approvedMembers.length < 5}
            >
              {startingGroup ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Start Group
            </Button>
          )}
          <Button variant="outline" onClick={() => toast({ title: "Coming soon", description: "Export functionality will be available soon" })}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {!group.started_at && approvedMembers.length < 5 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Group Not Started</AlertTitle>
          <AlertDescription>
            You need at least 5 approved members to start the group. Currently: {approvedMembers.length} approved.
          </AlertDescription>
        </Alert>
      )}

      {pendingMembers.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Pending Approvals</AlertTitle>
          <AlertDescription>
            You have {pendingMembers.length} member(s) waiting for approval.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Members</p>
              <p className="text-2xl font-bold">{statistics.member_count}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {approvedMembers.length} approved
              </p>
            </div>
            <Users className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
              <p className="text-2xl font-bold">
                KES {statistics.total_savings.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Goal: KES {group.saving_goal.toLocaleString()}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Profits</p>
              <p className="text-2xl font-bold text-primary">
                KES {statistics.total_profits.toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Active Loans</p>
              <p className="text-2xl font-bold">{statistics.active_loan_amount ? '1+' : '0'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pool: KES {Math.max(statistics.loan_pool_available, 0).toLocaleString()}
              </p>
            </div>
            <PieChart className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="members">
            Members
            {pendingMembers.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingMembers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="loans">
            Loans
            {pendingLoans.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingLoans.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="profits">Profits</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Member Management</h3>
            
            {pendingMembers.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold mb-3">Pending Approvals</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMembers.map((member: any) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.profiles?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>{member.profiles?.email || 'N/A'}</TableCell>
                        <TableCell>{member.profiles?.phone || 'N/A'}</TableCell>
                        <TableCell>{new Date(member.joined_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApproveMember(member.id, true)}
                              disabled={actionLoading === member.id}
                            >
                              {actionLoading === member.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleApproveMember(member.id, false)}
                              disabled={actionLoading === member.id}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <h4 className="font-semibold mb-3">Approved Members</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Savings</TableHead>
                  <TableHead>Lifetime Deposits</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedMembers.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Badge variant="outline">{member.unique_member_id || 'Pending'}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {member.profiles?.full_name || 'N/A'}
                    </TableCell>
                    <TableCell>KES {(member.current_savings || 0).toLocaleString()}</TableCell>
                    <TableCell>KES {(member.lifetime_deposits || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                        {member.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="loans" className="mt-6">
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Loan Management</h3>
            
            {pendingLoans.length > 0 ? (
              <>
                <h4 className="font-semibold mb-3">Pending Approvals</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingLoans.map((loan: any) => (
                      <TableRow key={loan.id}>
                        <TableCell>
                          {loan.saving_group_members?.profiles?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell className="font-semibold">
                          KES {loan.requested_amount.toLocaleString()}
                        </TableCell>
                        <TableCell>{new Date(loan.requested_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleApproveLoan(loan.id)}
                            disabled={actionLoading === loan.id}
                          >
                            {actionLoading === loan.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Approve
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">No pending loan requests</p>
            )}

            {loans && loans.filter((l: any) => l.status !== 'PENDING_APPROVAL').length > 0 && (
              <>
                <h4 className="font-semibold mb-3 mt-6">All Loans</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borrower</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.filter((l: any) => l.status !== 'PENDING_APPROVAL').map((loan: any) => (
                      <TableRow key={loan.id}>
                        <TableCell>
                          {loan.saving_group_members?.profiles?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>KES {loan.requested_amount.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">
                          KES {loan.balance_remaining.toLocaleString()}
                        </TableCell>
                        <TableCell>{new Date(loan.due_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={loan.status === 'DISBURSED' ? 'default' : 'secondary'}>
                            {loan.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="mt-6">
          <SavingsGroupInviteManager groupId={group.id} />
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">Recent Transactions</h3>
            {!transactions || transactions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No transactions yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 20).map((txn: any) => (
                    <TableRow key={txn.id}>
                      <TableCell>
                        <Badge variant="outline">{txn.transaction_type}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">
                        KES {txn.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{new Date(txn.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {txn.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="profits" className="mt-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Profit Distribution</h3>
              {group.started_at && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleCalculateProfits}
                    disabled={actionLoading === 'calculate-profits'}
                    variant="outline"
                  >
                    {actionLoading === 'calculate-profits' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <PieChart className="mr-2 h-4 w-4" />
                    )}
                    Calculate Profits
                  </Button>
                  <Button
                    onClick={() => setConfirmDialog({ open: true, type: 'distribute' })}
                    disabled={actionLoading === 'distribute-profits' || !cycleEnded}
                  >
                    {actionLoading === 'distribute-profits' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Gift className="mr-2 h-4 w-4" />
                    )}
                    Distribute Profits
                  </Button>
                </div>
              )}
            </div>

            {!cycleEnded && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Cycle ends on {new Date(group.cycle_end_date).toLocaleDateString()}. 
                  Profit distribution will be available after the cycle ends.
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-muted p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Profits</p>
                  <p className="text-2xl font-bold text-primary">
                    KES {statistics.total_profits.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Eligible Members</p>
                  <p className="text-2xl font-bold">
                    {approvedMembers.filter((m: any) => m.status === 'active').length}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Dialogs */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open, type: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'start' ? 'Start Group' : 'Distribute Profits'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'start' 
                ? `This will start the group with ${approvedMembers.length} members. All members will receive SMS notifications with their unique member IDs. This action cannot be undone.`
                : `This will distribute KES ${statistics.total_profits.toLocaleString()} in profits to ${approvedMembers.filter((m: any) => m.status === 'active').length} active members based on their savings ratio. All members will receive SMS notifications. This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDialog.type === 'start' ? handleStartGroup : handleDistributeProfits}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
