import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle, CheckCircle2, Wallet, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentCountdownTimerProps {
  endDate: string;
  contributionAmount: number;
  totalPayable?: number;
  beneficiaryName: string;
  paidCount: number;
  totalCount: number;
  isPaid: boolean;
  isGracePeriod?: boolean;
  onPayNow?: () => void;
}

export function PaymentCountdownTimer({
  endDate,
  contributionAmount,
  totalPayable,
  beneficiaryName,
  paidCount,
  totalCount,
  isPaid,
  isGracePeriod = false,
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
      // Use endDate directly as the cutoff — it already represents the payment deadline
      const cutoff = new Date(endDate);
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
    const interval = setInterval(
      calculateTimeRemaining,
      timeRemaining.total < 3600000 ? 1000 : 60000
    );

    return () => clearInterval(interval);
  }, [endDate, timeRemaining.total]);

  // If already paid, show success state
  if (isPaid) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
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

  // Grace period state — calming informational card
  if (isGracePeriod) {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  Grace Period Active
                </span>
              </div>
              <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400">
                No penalties
              </Badge>
            </div>

            {/* Countdown */}
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              {timeRemaining.days > 0 && (
                <>
                  <CountdownUnit value={timeRemaining.days} label="Days" className="text-blue-600 dark:text-blue-400" />
                  <span className="text-2xl sm:text-3xl font-light text-blue-600 dark:text-blue-400">:</span>
                </>
              )}
              <CountdownUnit value={timeRemaining.hours} label="Hours" className="text-blue-600 dark:text-blue-400" />
              <span className="text-2xl sm:text-3xl font-light text-blue-600 dark:text-blue-400">:</span>
              <CountdownUnit value={timeRemaining.minutes} label="Mins" className="text-blue-600 dark:text-blue-400" />
              {timeRemaining.total < 3600000 && (
                <>
                  <span className="text-2xl sm:text-3xl font-light text-blue-600 dark:text-blue-400">:</span>
                  <CountdownUnit value={timeRemaining.seconds} label="Secs" className="text-blue-600 dark:text-blue-400" />
                </>
              )}
            </div>

            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">
                First payment: KES {Math.round(contributionAmount).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Today's beneficiary: <span className="font-medium text-foreground">{beneficiaryName}</span>
              </p>
            </div>

            <p className="text-xs text-center text-blue-600 dark:text-blue-400">
              🛡️ This is your first cycle. No penalties will apply during the grace period.
            </p>

            {onPayNow && (
              <Button onClick={onPayNow} variant="outline" className="w-full border-blue-500/30 text-blue-600 hover:bg-blue-500/10" size="lg">
                <Wallet className="h-4 w-4 mr-2" />
                Pay Now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Cutoff passed and not paid
  if (timeRemaining.isPassed) {
    return (
      <Card className="border-muted bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-center space-y-3">
            <Badge variant="secondary" className="text-sm">Cutoff Passed</Badge>
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

  // Determine urgency level
  const getUrgencyLevel = () => {
    if (timeRemaining.total < 5 * 60 * 1000) return 'critical';
    if (timeRemaining.total < 15 * 60 * 1000) return 'urgent';
    if (timeRemaining.total < 60 * 60 * 1000) return 'warning';
    if (timeRemaining.total < 4 * 60 * 60 * 1000) return 'caution';
    return 'normal';
  };

  const urgency = getUrgencyLevel();

  const urgencyConfig: Record<string, { card: string; text: string; icon: typeof Clock; message: string }> = {
    critical: { card: 'border-destructive bg-destructive/10 animate-pulse', text: 'text-destructive', icon: AlertTriangle, message: 'HURRY! Time is almost up!' },
    urgent: { card: 'border-destructive/70 bg-destructive/5', text: 'text-destructive', icon: AlertTriangle, message: 'Payment deadline approaching!' },
    warning: { card: 'border-orange-500 bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', icon: Clock, message: 'Less than 1 hour remaining' },
    caution: { card: 'border-yellow-500 bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400', icon: Clock, message: 'Make your payment soon' },
    normal: { card: 'border-primary/30 bg-primary/5', text: 'text-primary', icon: Clock, message: 'Time to pay' },
  };

  const styles = urgencyConfig[urgency];
  const IconComponent = styles.icon;
  const progressPercentage = totalCount > 0 ? (paidCount / totalCount) * 100 : 0;

  return (
    <Card className={cn("transition-all duration-300", styles.card)}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconComponent className={cn("h-5 w-5", styles.text)} />
              <span className={cn("font-medium", styles.text)}>{styles.message}</span>
            </div>
            <Badge variant="outline" className="text-xs">10:00 PM Cutoff</Badge>
          </div>

          {/* Countdown */}
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {timeRemaining.days > 0 && (
              <>
                <CountdownUnit value={timeRemaining.days} label="Days" className={styles.text} />
                <span className={cn("text-2xl sm:text-3xl font-light", styles.text)}>:</span>
              </>
            )}
            <CountdownUnit value={timeRemaining.hours} label="Hours" className={styles.text} />
            <span className={cn("text-2xl sm:text-3xl font-light", styles.text)}>:</span>
            <CountdownUnit value={timeRemaining.minutes} label="Mins" className={styles.text} />
            {timeRemaining.total < 3600000 && (
              <>
                <span className={cn("text-2xl sm:text-3xl font-light", styles.text)}>:</span>
                <CountdownUnit value={timeRemaining.seconds} label="Secs" className={styles.text} pulse={urgency === 'critical'} />
              </>
            )}
          </div>

          {/* Payment Info */}
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold">
              Pay KES {Math.round(totalPayable || contributionAmount).toLocaleString()}
            </p>
            {totalPayable && totalPayable > contributionAmount && (
              <p className="text-xs text-destructive">
                Includes KES {Math.round(totalPayable - contributionAmount).toLocaleString()} outstanding debt + penalties
              </p>
            )}
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
              className={cn("w-full", urgency === 'critical' && "animate-pulse")}
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

function CountdownUnit({ value, label, className, pulse }: { value: number; label: string; className: string; pulse?: boolean }) {
  return (
    <div className="text-center">
      <div className={cn("text-3xl sm:text-4xl font-bold tabular-nums", className, pulse && "animate-pulse")}>
        {String(value).padStart(2, '0')}
      </div>
      <div className="text-xs text-muted-foreground uppercase">{label}</div>
    </div>
  );
}
