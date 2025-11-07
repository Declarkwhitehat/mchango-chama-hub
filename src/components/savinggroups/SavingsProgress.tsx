import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SavingsProgressProps {
  memberId: string;
  groupId: string;
  isLoanEligible: boolean;
}

export default function SavingsProgress({
  memberId,
  groupId,
  isLoanEligible,
}: SavingsProgressProps) {
  const [monthlyDeposits, setMonthlyDeposits] = useState<number>(0);
  const [paidByOthers, setPaidByOthers] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const TARGET = 2000;
  const currentDate = new Date();
  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();
  const daysLeft = daysInMonth - currentDate.getDate();
  const percentage = Math.min((monthlyDeposits / TARGET) * 100, 100);

  useEffect(() => {
    loadMonthlyData();
  }, [memberId, groupId]);

  const loadMonthlyData = async () => {
    try {
      const firstDayOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      ).toISOString();

      const { data: deposits, error } = await supabase
        .from("saving_deposits")
        .select("net_amount, user_id, paid_by_user_id, profiles!saving_deposits_paid_by_user_id_fkey(full_name)")
        .eq("member_id", memberId)
        .eq("group_id", groupId)
        .gte("deposit_date", firstDayOfMonth);

      if (error) throw error;

      const total = deposits?.reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;
      setMonthlyDeposits(total);

      const paidByOthersAmount =
        deposits
          ?.filter((d) => d.user_id !== d.paid_by_user_id)
          .reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;
      setPaidByOthers(paidByOthersAmount);
    } catch (error: any) {
      console.error("Error loading monthly data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Savings Progress & Monthly Target
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  To be loan-eligible, save at least KSh 2,000 per month for 3
                  consecutive months and have no active loan.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>
              This month: KSh {monthlyDeposits.toFixed(2)} / KSh {TARGET.toFixed(2)}{" "}
              ({percentage.toFixed(1)}%)
            </span>
            <span className="text-muted-foreground">
              Days left this month: {daysLeft}
            </span>
          </div>
          <Progress value={percentage} className="h-3" />
        </div>

        {paidByOthers > 0 && (
          <p className="text-sm text-muted-foreground">
            Includes KSh {paidByOthers.toFixed(2)} paid by others
          </p>
        )}

        <div className="flex items-center gap-2">
          {percentage >= 100 ? (
            <Badge variant="default" className="bg-green-600">
              Loan Eligible (monthly requirement met)
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground">
              You're at {percentage.toFixed(1)}% of the recommended KSh 2,000/month.
              Keep saving to become loan-eligible.
            </p>
          )}
        </div>

        {isLoanEligible && (
          <Badge variant="default" className="bg-green-600">
            ✓ Fully Loan Eligible
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
