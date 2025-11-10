import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  PlusCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [stats, setStats] = useState({
    personalSavings: 0,
    groupSavings: 0,
    groupProfits: 0,
    activeLoans: [],
    recentTransactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [isEligibleForLoan, setIsEligibleForLoan] = useState(false);

  useEffect(() => {
    if (membership) {
      fetchMemberData();
    }
  }, [membership]);

  const fetchMemberData = async () => {
    try {
      // Fetch personal savings
      const personalSavings = membership?.current_savings || 0;

      // Fetch active loans
      const { data: loansData } = await supabase
        .from("saving_group_loans")
        .select("*")
        .eq("saving_group_id", group.id)
        .eq("borrower_user_id", membership.user_id)
        .eq("is_active", true);

      // Fetch recent transactions
      const { data: transactionsData } = await supabase
        .from("saving_group_deposits")
        .select("*")
        .eq("saving_group_id", group.id)
        .eq("member_user_id", membership.user_id)
        .order("created_at", { ascending: false })
        .limit(5);

      // Check loan eligibility
      const eligible = personalSavings >= 2000 && (loansData?.length || 0) === 0;

      setStats({
        personalSavings,
        groupSavings: group.total_savings || 0,
        groupProfits: group.total_profits || 0,
        activeLoans: loansData || [],
        recentTransactions: transactionsData || [],
      });

      setIsEligibleForLoan(eligible);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    try {
      const { error } = await supabase.from("saving_group_members").insert({
        group_id: group.id,
        user_id: membership.user_id,
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Join request sent. Awaiting manager approval.",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!membership) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">{group.name}</h2>
        <p className="text-muted-foreground mb-6">{group.description}</p>
        <Button onClick={handleJoinGroup} size="lg">
          <PlusCircle className="mr-2 h-5 w-5" />
          Request to Join
        </Button>
      </Card>
    );
  }

  if (membership.status === "pending") {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Your join request is pending approval by the group manager.
        </AlertDescription>
      </Alert>
    );
  }

  const savingsProgress = Math.min(
    100,
    (stats.personalSavings / 2000) * 100
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1">{group.name}</h1>
        <p className="text-muted-foreground">Member Dashboard</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Personal Savings
              </p>
              <p className="text-2xl font-bold">
                KES {stats.personalSavings.toLocaleString()}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-primary opacity-20" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Monthly Target</span>
              <span className="font-medium">KES 2,000</span>
            </div>
            <Progress value={savingsProgress} />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Group Savings</p>
              <p className="text-2xl font-bold">
                KES {stats.groupSavings.toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Group Profits</p>
              <p className="text-2xl font-bold">
                KES {stats.groupProfits.toLocaleString()}
              </p>
            </div>
            <CreditCard className="h-10 w-10 text-primary opacity-20" />
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => navigate(`/savings-group/${group.id}/deposit`)}
          size="lg"
        >
          <PlusCircle className="mr-2 h-5 w-5" />
          Make Deposit
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate(`/savings-group/${group.id}/loan-request`)}
          disabled={!isEligibleForLoan}
        >
          <CreditCard className="mr-2 h-5 w-5" />
          Request Loan
        </Button>
      </div>

      {!isEligibleForLoan && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Loan eligibility requires KES 2,000+ savings and no active loans.
            Keep saving to qualify!
          </AlertDescription>
        </Alert>
      )}

      {/* Active Loans */}
      {stats.activeLoans.length > 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Active Loans</h3>
          <div className="space-y-4">
            {stats.activeLoans.map((loan: any) => (
              <div
                key={loan.id}
                className="flex justify-between items-center p-4 bg-muted rounded-lg"
              >
                <div>
                  <p className="font-semibold">
                    KES {loan.disbursed_amount.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Due: {new Date(loan.due_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    KES {loan.balance_remaining.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Remaining</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Recent Transactions</h3>
        {stats.recentTransactions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No transactions yet
          </p>
        ) : (
          <div className="space-y-3">
            {stats.recentTransactions.map((txn: any) => (
              <div
                key={txn.id}
                className="flex justify-between items-center p-3 bg-muted rounded-lg"
              >
                <div>
                  <p className="font-medium">Deposit</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(txn.created_at).toLocaleDateString()}
                  </p>
                </div>
                <p className="font-semibold text-primary">
                  +KES {txn.net_amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
