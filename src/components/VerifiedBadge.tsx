import { BadgeCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export const VerifiedBadge = ({
  className,
  size = "md",
  showTooltip = true,
}: VerifiedBadgeProps) => {
  const badge = (
    <BadgeCheck
      className={cn(
        "text-blue-500 fill-blue-500 shrink-0",
        sizeClasses[size],
        className
      )}
    />
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Verified by Admin</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
