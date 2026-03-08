import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, Clock } from "lucide-react";

interface ChamaEndDateProps {
  startDate: string | null;
  contributionFrequency: string;
  everyNDaysCount?: number;
  memberCount: number;
  status: string;
}

export const ChamaEndDate = ({
  startDate,
  contributionFrequency,
  everyNDaysCount,
  memberCount,
  status,
}: ChamaEndDateProps) => {
  // Only show for active chamas with a start date
  if (status !== 'active' || !startDate || memberCount === 0) {
    return null;
  }

  const getCycleLengthInDays = (frequency: string, everyNDays?: number): number => {
    switch (frequency) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'monthly': return 30;
      case 'every_n_days': return everyNDays || 7;
      default: return 7;
    }
  };

  const cycleDays = getCycleLengthInDays(contributionFrequency, everyNDaysCount);
  
  // Total days = number of members × cycle length (each member gets one payout)
  const totalDays = memberCount * cycleDays;
  
  // Calculate end date from start date (not created_at)
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + totalDays);

  // Format the end date
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Calculate days remaining
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const isCompleted = daysRemaining === 0;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {isCompleted ? 'Cycle Completed' : 'Estimated End Date'}
            </p>
            <p className="text-lg font-bold text-primary">
              {formatDate(endDate)}
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>At {formatTime(endDate)}</span>
            </div>
            {!isCompleted && (
              <p className="text-xs text-muted-foreground mt-2">
                {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining • {memberCount} member{memberCount !== 1 ? 's' : ''} × {cycleDays} day{cycleDays !== 1 ? 's' : ''} per cycle
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
