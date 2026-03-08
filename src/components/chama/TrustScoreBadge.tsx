import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

interface TrustScoreBadgeProps {
  score: number;
  compact?: boolean;
}

export const TrustScoreBadge = ({ score, compact = false }: TrustScoreBadgeProps) => {
  const getScoreConfig = (s: number) => {
    if (s >= 80) return { label: "Excellent", icon: ShieldCheck, variant: "default" as const, className: "bg-green-600 hover:bg-green-700" };
    if (s >= 60) return { label: "Good", icon: Shield, variant: "default" as const, className: "bg-blue-600 hover:bg-blue-700" };
    if (s >= 40) return { label: "Fair", icon: Shield, variant: "secondary" as const, className: "" };
    return { label: "Low", icon: ShieldAlert, variant: "destructive" as const, className: "" };
  };

  const config = getScoreConfig(score);
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant={config.variant} className={`gap-1 text-xs ${config.className}`}>
              <Icon className="h-3 w-3" />
              {score}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Trust Score: {score}/100 ({config.label})</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      Trust: {score}/100
    </Badge>
  );
};
