import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCheck, UserX, Loader2, AlertTriangle, CheckCircle2, Info, TrendingUp, TrendingDown, ShieldCheck, Shield, ShieldAlert, Clock, Star } from "lucide-react";
import { TrustScoreBadge } from "@/components/chama/TrustScoreBadge";

interface TrustScoreDetail {
  user_id: string;
  trust_score: number;
  total_chamas_completed: number;
  total_on_time_payments: number;
  total_late_payments: number;
  total_missed_payments: number;
  total_outstanding_debts: number;
  updated_at: string;
}

interface MemberDetailPanelProps {
  fullName: string;
  email: string;
  phone: string;
  joinedAt: string;
  detail: TrustScoreDetail | undefined;
  processingId: string | null;
  memberId: string;
  onApprove: () => void;
  onReject: () => void;
}

function getAdvice(detail: TrustScoreDetail | undefined): { type: 'positive' | 'caution' | 'warning' | 'neutral'; message: string; icon: typeof CheckCircle2 } {
  if (!detail) {
    return {
      type: 'neutral',
      message: 'This is a new user with no Chama history. Consider verifying their identity before approving.',
      icon: Info,
    };
  }

  const { trust_score, total_missed_payments, total_outstanding_debts, total_chamas_completed, total_on_time_payments, total_late_payments } = detail;
  const totalPayments = total_on_time_payments + total_late_payments + total_missed_payments;

  if (total_outstanding_debts > 0) {
    return {
      type: 'warning',
      message: `⚠️ This member has ${total_outstanding_debts} outstanding debt${total_outstanding_debts > 1 ? 's' : ''} from previous Chamas. Approving may carry financial risk.`,
      icon: AlertTriangle,
    };
  }

  if (trust_score >= 80) {
    return {
      type: 'positive',
      message: `✅ Highly reliable member. ${total_chamas_completed} Chama${total_chamas_completed !== 1 ? 's' : ''} completed, ${total_on_time_payments}/${totalPayments} payments on time. Safe to approve.`,
      icon: CheckCircle2,
    };
  }

  if (trust_score >= 60) {
    return {
      type: 'positive',
      message: `Good track record. ${total_on_time_payments}/${totalPayments} payments on time with ${total_late_payments} late. Generally reliable.`,
      icon: CheckCircle2,
    };
  }

  if (trust_score >= 40) {
    return {
      type: 'caution',
      message: `Mixed history — ${total_missed_payments} missed and ${total_late_payments} late payments. Review carefully before approving.`,
      icon: Info,
    };
  }

  return {
    type: 'warning',
    message: `Low trust score. ${total_missed_payments} missed payments and ${total_late_payments} late payments. High risk of default.`,
    icon: AlertTriangle,
  };
}

export const MemberDetailPanel = ({
  fullName,
  email,
  phone,
  joinedAt,
  detail,
  processingId,
  memberId,
  onApprove,
  onReject,
}: MemberDetailPanelProps) => {
  const advice = getAdvice(detail);
  const AdviceIcon = advice.icon;
  const totalPayments = detail ? detail.total_on_time_payments + detail.total_late_payments + detail.total_missed_payments : 0;

  const adviceBorderColor = {
    positive: 'border-green-500/30 bg-green-500/5',
    caution: 'border-amber-500/30 bg-amber-500/5',
    warning: 'border-destructive/30 bg-destructive/5',
    neutral: 'border-border bg-muted/30',
  }[advice.type];

  const adviceTextColor = {
    positive: 'text-green-700 dark:text-green-400',
    caution: 'text-amber-700 dark:text-amber-400',
    warning: 'text-destructive',
    neutral: 'text-muted-foreground',
  }[advice.type];

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-border">
      {/* Contact details */}
      <div className="grid grid-cols-2 gap-3 pt-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</p>
          <p className="text-sm text-foreground">{phone}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</p>
          <p className="text-sm text-foreground truncate">{email}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Request Date</p>
          <p className="text-sm text-foreground">{new Date(joinedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Trust Score</p>
          {detail ? <TrustScoreBadge score={detail.trust_score} /> : <span className="text-sm text-muted-foreground">No data</span>}
        </div>
      </div>

      {/* Trust score breakdown */}
      {detail && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard
            label="Chamas Done"
            value={detail.total_chamas_completed}
            icon={<Star className="h-3.5 w-3.5 text-amber-500" />}
          />
          <StatCard
            label="On-Time"
            value={detail.total_on_time_payments}
            suffix={totalPayments > 0 ? `/${totalPayments}` : ''}
            icon={<TrendingUp className="h-3.5 w-3.5 text-green-500" />}
          />
          <StatCard
            label="Late"
            value={detail.total_late_payments}
            icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
            warn={detail.total_late_payments > 2}
          />
          <StatCard
            label="Debts"
            value={detail.total_outstanding_debts}
            icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            warn={detail.total_outstanding_debts > 0}
          />
        </div>
      )}

      {/* Manager advice */}
      <div className={`rounded-lg border p-3 ${adviceBorderColor}`}>
        <div className="flex items-start gap-2">
          <AdviceIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${adviceTextColor}`} />
          <p className={`text-sm ${adviceTextColor}`}>{advice.message}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          className="flex-1"
          onClick={onApprove}
          disabled={processingId === memberId}
        >
          {processingId === memberId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <><UserCheck className="h-4 w-4 mr-1" />Approve</>
          )}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="flex-1"
          onClick={onReject}
          disabled={processingId === memberId}
        >
          {processingId === memberId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <><UserX className="h-4 w-4 mr-1" />Reject</>
          )}
        </Button>
      </div>
    </div>
  );
};

function StatCard({ label, value, suffix, icon, warn }: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-md border p-2 text-center ${warn ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-background'}`}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {icon}
        <span className={`text-lg font-bold ${warn ? 'text-destructive' : 'text-foreground'}`}>
          {value}{suffix}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}
