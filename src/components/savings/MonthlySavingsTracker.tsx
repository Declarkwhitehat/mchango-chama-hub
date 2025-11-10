import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';

interface MonthlyData {
  month: string;
  total: number;
  target: number;
  percentage: number;
  target_met: boolean;
}

interface MonthlySavingsTrackerProps {
  monthlyData?: MonthlyData[];
}

export function MonthlySavingsTracker({ monthlyData = [] }: MonthlySavingsTrackerProps) {
  const TARGET_AMOUNT = 2000;
  
  // If no data provided, generate empty months for last 6 months
  const months = monthlyData.length > 0 ? monthlyData : generateEmptyMonths();

  // Count consecutive months with target met (for loan eligibility)
  const recentMonthsMet = months.slice(0, 3).filter(m => m.target_met).length;
  const isLoanEligible = recentMonthsMet === 3;

  function generateEmptyMonths(): MonthlyData[] {
    const emptyMonths: MonthlyData[] = [];
    for (let i = 0; i < 6; i++) {
      const monthDate = subMonths(startOfMonth(new Date()), i);
      emptyMonths.push({
        month: format(monthDate, 'MMMM yyyy'),
        total: 0,
        target: TARGET_AMOUNT,
        percentage: 0,
        target_met: false,
      });
    }
    return emptyMonths;
  }

  const getStatusIcon = (targetMet: boolean, percentage: number) => {
    if (targetMet) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    } else if (percentage >= 75) {
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Savings Tracker</CardTitle>
        <CardDescription>
          Track your monthly progress towards the KSh 2,000 target
        </CardDescription>
        
        {isLoanEligible ? (
          <Badge variant="default" className="w-fit mt-2">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Loan Eligible (3/3 months met)
          </Badge>
        ) : (
          <Badge variant="secondary" className="w-fit mt-2">
            {recentMonthsMet}/3 recent months met target
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {months.map((month, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(month.target_met, month.percentage)}
                <span className="font-medium">{month.month}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                KSh {month.total.toLocaleString()} / {month.target.toLocaleString()}
              </span>
            </div>
            
            <div className="space-y-1">
              <Progress 
                value={Math.min(month.percentage, 100)} 
                className="h-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{month.percentage.toFixed(0)}% complete</span>
                {month.target_met && (
                  <span className="text-green-600 font-medium">Target Met ✓</span>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Loan Eligibility:</strong> Save at least KSh 2,000 for 3 consecutive months to become eligible for loans.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
