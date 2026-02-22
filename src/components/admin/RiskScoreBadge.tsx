import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RiskScoreBadgeProps {
  level: string;
  score?: number;
  className?: string;
}

const levelConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400" },
  medium: { label: "Medium", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-400" },
  critical: { label: "Critical", className: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400" },
};

export function RiskScoreBadge({ level, score, className }: RiskScoreBadgeProps) {
  const config = levelConfig[level] || levelConfig.low;
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}{score !== undefined ? ` (${score})` : ""}
    </Badge>
  );
}
