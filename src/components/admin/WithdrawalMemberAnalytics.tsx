import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingDown, 
  TrendingUp,
  User,
  Calendar,
  XCircle
} from "lucide-react";

interface SkipRecord {
  skipped_at: string;
  reason: string;
  rescheduled_to: number | null;
}

interface MemberAnalytics {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  missed_payments_count: number;
  late_payments_count: number;
  on_time_payments_count: number;
  on_time_rate: number;
  total_contributed: number;
  expected_contributions: number;
  balance_deficit: number;
  balance_credit: number;
  skip_history: SkipRecord[];
  payout_position: number;
  risk_level: 'low' | 'medium' | 'high';
  first_payment_completed: boolean;
  joined_at: string;
}

interface NextEligibleMember {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  on_time_rate: number;
  risk_level: 'low' | 'medium' | 'high';
}

interface WithdrawalMemberAnalyticsProps {
  analytics: MemberAnalytics | null;
  nextEligible: NextEligibleMember | null;
  isLoading: boolean;
}

export const WithdrawalMemberAnalytics = ({ 
  analytics, 
  nextEligible, 
  isLoading 
}: WithdrawalMemberAnalyticsProps) => {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-muted rounded-lg" />
        <div className="h-24 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Unable to load member analytics
      </div>
    );
  }

  const getRiskBadge = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low':
        return <Badge className="bg-green-500 text-white gap-1"><CheckCircle className="h-3 w-3" />Low Risk</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />Medium Risk</Badge>;
      case 'high':
        return <Badge className="bg-red-500 text-white gap-1"><XCircle className="h-3 w-3" />High Risk</Badge>;
    }
  };

  const contributionProgress = analytics.expected_contributions > 0 
    ? Math.min((analytics.total_contributed / analytics.expected_contributions) * 100, 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Risk Level Banner */}
      <Card className={`border-2 ${
        analytics.risk_level === 'high' ? 'border-red-500 bg-red-50 dark:bg-red-950/20' :
        analytics.risk_level === 'medium' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20' :
        'border-green-500 bg-green-50 dark:bg-green-950/20'
      }`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Payment Health Analysis
            </span>
            {getRiskBadge(analytics.risk_level)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-2 bg-background rounded-lg">
              <div className={`text-xl font-bold ${analytics.missed_payments_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {analytics.missed_payments_count}
              </div>
              <div className="text-xs text-muted-foreground">Missed Payments</div>
            </div>
            <div className="text-center p-2 bg-background rounded-lg">
              <div className={`text-xl font-bold ${analytics.late_payments_count > 2 ? 'text-yellow-600' : 'text-foreground'}`}>
                {analytics.late_payments_count}
              </div>
              <div className="text-xs text-muted-foreground">Late Payments</div>
            </div>
            <div className="text-center p-2 bg-background rounded-lg">
              <div className={`text-xl font-bold ${analytics.on_time_rate >= 80 ? 'text-green-600' : analytics.on_time_rate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {analytics.on_time_rate}%
              </div>
              <div className="text-xs text-muted-foreground">On-Time Rate</div>
            </div>
            <div className="text-center p-2 bg-background rounded-lg">
              <div className={`text-xl font-bold ${analytics.balance_deficit > 0 ? 'text-red-600' : 'text-foreground'}`}>
                KES {analytics.balance_deficit.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Deficit</div>
            </div>
          </div>

          {/* Contribution Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1">
                {contributionProgress >= 100 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-yellow-600" />
                )}
                Contribution Progress
              </span>
              <span className="font-medium">
                KES {analytics.total_contributed.toLocaleString()} / {analytics.expected_contributions.toLocaleString()}
              </span>
            </div>
            <Progress value={contributionProgress} className="h-2" />
          </div>

          {/* Member Info */}
          <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
            <div>
              <span className="text-muted-foreground">Position: </span>
              <span className="font-medium">#{analytics.payout_position}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Code: </span>
              <span className="font-mono font-medium">{analytics.member_code}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Phone: </span>
              <span className="font-medium">{analytics.phone}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Joined: </span>
              <span className="font-medium">
                {new Date(analytics.joined_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skip History */}
      {analytics.skip_history.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              Skip History ({analytics.skip_history.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.skip_history.slice(0, 3).map((skip, index) => (
                <div key={index} className="flex items-center justify-between text-sm p-2 bg-background rounded">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span>{new Date(skip.skipped_at).toLocaleDateString()}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">{skip.reason}</span>
                  {skip.rescheduled_to && (
                    <Badge variant="outline" className="text-xs">→ #{skip.rescheduled_to}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Eligible Member */}
      {nextEligible && (
        <>
          <Separator />
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                Next Eligible Member (If Rejected)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{nextEligible.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    #{nextEligible.order_index} • {nextEligible.member_code}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    {getRiskBadge(nextEligible.risk_level)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {nextEligible.on_time_rate}% on-time
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
