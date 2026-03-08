import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentCountdownTimerProps {
  endDate: string;
  cutoffHour?: number;
  contributionAmount: number;
  totalPayable?: number;
  beneficiaryName: string;
  paidCount: number;
  totalCount: number;
  isPaid: boolean;
  onPayNow?: () => void;
}

export function PaymentCountdownTimer({
  endDate,
  cutoffHour = 22,
  contributionAmount,
  totalPayable,
  beneficiaryName,
  paidCount,
  totalCount,
  isPaid,
  onPayNow
}: PaymentCountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
    isPassed: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, isPassed: false });

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date();
      const cycleEndDate = new Date(endDate);
      const cutoff = new Date(cycleEndDate);
      cutoff.setHours(cutoffHour, 0, 0, 0);

      const diff = cutoff.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, isPassed: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, minutes, seconds, total: diff, isPassed: false });
    };

    calculateTimeRemaining();
    
    // Update every second when < 1 hour, every minute otherwise
    const interval = setInterval(
      calculateTimeRemaining,
      timeRemaining.total < 3600000 ? 1000 : 60000
    );

    return () => clearInterval(interval);
  }, [endDate, cutoffHour, timeRemaining.total]);

  // Determine urgency level
  const getUrgencyLevel = () => {
    if (timeRemaining.isPassed) return 'passed';
    if (timeRemaining.total < 5 * 60 * 1000) return 'critical'; // < 5 minutes
    if (timeRemaining.total < 15 * 60 * 1000) return 'urgent'; // < 15 minutes
    if (timeRemaining.total < 60 * 60 * 1000) return 'warning'; // < 1 hour
    if (timeRemaining.total < 4 * 60 * 60 * 1000) return 'caution'; // < 4 hours
    return 'normal';
  };

  const urgency = getUrgencyLevel();

  const getUrgencyStyles = () => {
    switch (urgency) {
      case 'critical':
        return {
          card: 'border-destructive bg-destructive/10 animate-pulse',
          text: 'text-destructive',
          icon: AlertTriangle,
          message: 'HURRY! Time is almost up!'
        };
      case 'urgent':
        return {
          card: 'border-destructive/70 bg-destructive/5',
          text: 'text-destructive',
          icon: AlertTriangle,
          message: 'Payment deadline approaching!'
        };
      case 'warning':
        return {
          card: 'border-orange-500 bg-orange-500/10',
          text: 'text-orange-600 dark:text-orange-400',
          icon: Clock,
          message: 'Less than 1 hour remaining'
        };
      case 'caution':
        return {
          card: 'border-yellow-500 bg-yellow-500/10',
          text: 'text-yellow-600 dark:text-yellow-400',
          icon: Clock,
          message: 'Make your payment soon'
        };
      case 'passed':
        return {
          card: 'border-muted bg-muted',
          text: 'text-muted-foreground',
          icon: Clock,
          message: 'Payment cutoff has passed'
        };
      default:
        return {
          card: 'border-primary bg-primary/5',
          text: 'text-primary',
          icon: Clock,
          message: 'Time to pay'
        };
    }
  };

  const styles = getUrgencyStyles();
  const IconComponent = styles.icon;
  const progressPercentage = (paidCount / totalCount) * 100;

  // If already paid, show success state
  if (isPaid) {
    return (
      <Card className="border-green-500 bg-green-500/10">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div className="text-center">
              <p className="text-lg font-semibold text-green-600">Payment Complete</p>
              <p className="text-sm text-muted-foreground">
                You've paid for this cycle. Thank you!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If cutoff passed and not paid
  if (timeRemaining.isPassed) {
    return (
      <Card className="border-muted bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-center space-y-3">
            <Badge variant="secondary" className="text-sm">
              Cutoff Passed
            </Badge>
            <p className="text-sm text-muted-foreground">
              Payments made now will be credited to the next cycle as late payments.
            </p>
            {onPayNow && (
              <Button onClick={onPayNow} variant="outline" className="mt-2">
                <Wallet className="h-4 w-4 mr-2" />
                Pay for Next Cycle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("transition-all duration-300", styles.card)}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconComponent className={cn("h-5 w-5", styles.text)} />
              <span className={cn("font-medium", styles.text)}>
                {styles.message}
              </span>
            </div>
            <Badge variant="outline" className="text-xs">
              10:00 PM Cutoff
            </Badge>
          </div>

          {/* Countdown Display */}
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {timeRemaining.days > 0 && (
              <>
                <div className="text-center">
                  <div className={cn(
                    "text-3xl sm:text-4xl font-bold tabular-nums",
                    styles.text
                  )}>
                    {String(timeRemaining.days).padStart(2, '0')}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase">Days</div>
                </div>
                <span className={cn("text-2xl sm:text-3xl font-light", styles.text)}>:</span>
              </>
            )}
            
            <div className="text-center">
              <div className={cn(
                "text-3xl sm:text-4xl font-bold tabular-nums",
                styles.text
              )}>
                {String(timeRemaining.hours).padStart(2, '0')}
              </div>
              <div className="text-xs text-muted-foreground uppercase">Hours</div>
            </div>
            
            <span className={cn("text-2xl sm:text-3xl font-light", styles.text)}>:</span>
            
            <div className="text-center">
              <div className={cn(
                "text-3xl sm:text-4xl font-bold tabular-nums",
                styles.text
              )}>
                {String(timeRemaining.minutes).padStart(2, '0')}
              </div>
              <div className="text-xs text-muted-foreground uppercase">Mins</div>
            </div>
            
            {timeRemaining.total < 3600000 && (
              <>
                <span className={cn("text-2xl sm:text-3xl font-light", styles.text)}>:</span>
                <div className="text-center">
                  <div className={cn(
                    "text-3xl sm:text-4xl font-bold tabular-nums",
                    styles.text,
                    urgency === 'critical' && 'animate-pulse'
                  )}>
                    {String(timeRemaining.seconds).padStart(2, '0')}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase">Secs</div>
                </div>
              </>
            )}
          </div>

          {/* Payment Info */}
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold">
              Pay KES {contributionAmount.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Today's beneficiary: <span className="font-medium text-foreground">{beneficiaryName}</span>
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Members paid</span>
              <span className="font-medium">{paidCount}/{totalCount}</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Pay Now Button */}
          {onPayNow && (
            <Button 
              onClick={onPayNow} 
              className={cn(
                "w-full",
                urgency === 'critical' && "animate-pulse"
              )}
              size="lg"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pay Now
            </Button>
          )}

          {/* Warning Message */}
          {(urgency === 'critical' || urgency === 'urgent') && (
            <p className="text-xs text-center text-destructive">
              ⚠️ Payments after 10:00 PM will be marked as LATE and charged a 10% penalty
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
