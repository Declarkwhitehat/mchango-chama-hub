import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import LoanRequestForm from "./LoanRequestForm";
import LoanRepaymentForm from "./LoanRepaymentForm";
import { SavingsDepositForm } from "./SavingsDepositForm";
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  PlusCircle,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Gift,
  History,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MonthlySavingsTracker } from "./MonthlySavingsTracker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MemberDashboardProps {
  group: any;
  membership: any;
  onRefresh: () => void;
}

export default function SavingsGroupMemberDashboard({
  group,
  membership,
  onRefresh,
}: MemberDashboardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [repaymentDialogOpen, setRepaymentDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);

  useEffect(() => {
    if (membership?.id) {
      fetchDashboardData();
    }
  }, [membership]);

  const fetchDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-crud/members/${membership.id}/dashboard`,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboardData || !membership) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load dashboard data. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  if (!membership.is_approved) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Pending Approval</AlertTitle>
        <AlertDescription>
          Your join request is pending approval by the group manager. You'll be notified once approved.
        </AlertDescription>
      </Alert>
    );
  }

  const { statistics, eligibility, loans, transactions, profit_shares } = dashboardData;
  const activeLoan = loans?.find((l: any) => l.status === 'DISBURSED' || l.status === 'APPROVED');
  
  const monthlyTarget = 2000;
  const savingsProgress = Math.min(100, (statistics.personal_savings / monthlyTarget) * 100);
  const groupProgress = Math.min(100, (statistics.group_total_savings / group.saving_goal) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1">{group.name}</h1>
        <p className="text-muted-foreground">Member Dashboard</p>
        {membership.unique_member_id && (
          <Badge variant="secondary" className="mt-2">
            ID: {membership.unique_member_id}
          </Badge>
        )}
      </div>

      {/* Loan Eligibility Alert */}
      {eligibility.is_loan_eligible ? (
        <Alert className="border-primary">
          <CheckCircle className="h-4 w-4 text-primary" />
          <AlertTitle>Loan Eligible</AlertTitle>
          <AlertDescription>
            You're eligible to request a loan up to KES {eligibility.max_loan_amount.toLocaleString()}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not Loan Eligible Yet</AlertTitle>
          <AlertDescription>
            Save at least KES 2,000 per month for 3 consecutive months to qualify for loans.
            {eligibility.has_active_loan && " You also have an active loan that must be repaid first."}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Personal Savings</p>
              <p className="text-2xl font-bold">
                KES {statistics.personal_savings.toLocaleString()}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-primary opacity-20" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Monthly Target</span>
              <span className="font-medium">KES {monthlyTarget.toLocaleString()}</span>
            </div>
            <Progress value={savingsProgress} />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Lifetime Deposits</p>
              <p className="text-2xl font-bold">
                KES {statistics.lifetime_deposits.toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Group Savings</p>
              <p className="text-2xl font-bold">
                KES {statistics.group_total_savings.toLocaleString()}
              </p>
              <div className="mt-2">
                <Progress value={groupProgress} />
                <p className="text-xs text-muted-foreground mt-1">
                  {groupProgress.toFixed(0)}% of goal
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Profits Earned</p>
              <p className="text-2xl font-bold text-primary">
                KES {statistics.total_profit_earned.toLocaleString()}
              </p>
            </div>
            <Gift className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              Make Deposit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Make a Deposit</DialogTitle>
              <DialogDescription>
                1% commission will be deducted from your deposit
              </DialogDescription>
            </DialogHeader>
            <SavingsDepositForm
              groupId={group.id}
              memberId={membership.id}
              groupName={group.name}
              onSuccess={() => {
                setDepositDialogOpen(false);
                fetchDashboardData();
                onRefresh();
              }}
            />
          </DialogContent>
        </Dialog>
        
        <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="lg"
              disabled={!eligibility.is_loan_eligible || eligibility.has_active_loan}
            >
              <CreditCard className="mr-2 h-5 w-5" />
              Request Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request Loan</DialogTitle>
            </DialogHeader>
            <LoanRequestForm 
              groupId={group.id} 
              memberId={membership.id}
              onSuccess={() => {
                setLoanDialogOpen(false);
                fetchDashboardData();
                onRefresh();
              }}
            />
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate(`/savings-groups/${group.id}/activity`)}
        >
          <History className="mr-2 h-5 w-5" />
          View Full Activity
        </Button>

        <Button
          variant="ghost"
          size="lg"
          onClick={onRefresh}
        >
          Refresh Data
        </Button>
      </div>

      {/* Monthly Savings Tracker */}
      <MonthlySavingsTracker monthlyData={dashboardData?.monthly_savings} />

      {/* Active Loan with Repayment */}
      {activeLoan && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center">
              <CreditCard className="mr-2 h-5 w-5" />
              Active Loan
            </h3>
            {activeLoan.balance_remaining > 0 && (
              <Dialog open={repaymentDialogOpen} onOpenChange={setRepaymentDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="default">
                    <DollarSign className="mr-2 h-4 w-4" />
                    Make Repayment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Loan Repayment</DialogTitle>
                  </DialogHeader>
                  <LoanRepaymentForm
                    loan={activeLoan}
                    onSuccess={() => {
                      setRepaymentDialogOpen(false);
                      fetchDashboardData();
                      onRefresh();
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
          
          <div className="bg-muted p-4 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Loan Amount</p>
                <p className="font-semibold">KES {activeLoan.requested_amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Disbursed</p>
                <p className="font-semibold">KES {activeLoan.disbursed_amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Balance</p>
                <p className="font-semibold text-primary">KES {activeLoan.balance_remaining.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Due Date</p>
                <p className="font-semibold">{new Date(activeLoan.due_date).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Repayment Progress</span>
                <span className="font-medium">
                  {(((activeLoan.requested_amount - activeLoan.balance_remaining) / activeLoan.requested_amount) * 100).toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={((activeLoan.requested_amount - activeLoan.balance_remaining) / activeLoan.requested_amount) * 100} 
                className="h-2"
              />
            </div>
            <Badge variant={activeLoan.status === 'DISBURSED' ? 'default' : 'secondary'} className="mt-4">
              {activeLoan.status}
            </Badge>
          </div>
        </Card>
      )}

      {/* Profit Shares */}
      {profit_shares && profit_shares.length > 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <Gift className="mr-2 h-5 w-5" />
            Profit Shares
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle Period</TableHead>
                <TableHead>Share Amount</TableHead>
                <TableHead>Savings Ratio</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profit_shares.map((share: any) => (
                <TableRow key={share.id}>
                  <TableCell>{share.saving_group_profits?.cycle_period || 'N/A'}</TableCell>
                  <TableCell className="font-semibold text-primary">
                    KES {share.share_amount.toLocaleString()}
                  </TableCell>
                  <TableCell>{(share.savings_ratio * 100).toFixed(2)}%</TableCell>
                  <TableCell>
                    {share.disbursed ? (
                      <Badge variant="default">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Disbursed
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4 flex items-center">
          <History className="mr-2 h-5 w-5" />
          Recent Transactions
        </h3>
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
              {transactions.slice(0, 10).map((txn: any) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <Badge variant="outline">{txn.transaction_type}</Badge>
                  </TableCell>
                  <TableCell className={
                    txn.transaction_type.includes('DEPOSIT') || txn.transaction_type.includes('PROFIT') 
                      ? 'text-primary font-semibold' 
                      : 'font-semibold'
                  }>
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
    </div>
  );
}
