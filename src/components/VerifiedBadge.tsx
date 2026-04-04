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
  sm: "text-xs px-1.5 py-0.5",
  md: "text-sm px-2 py-0.5",
  lg: "text-base px-2.5 py-1",
};

export const VerifiedBadge = ({
  className,
  size = "md",
  showTooltip = true,
}: VerifiedBadgeProps) => {
  const badge = (
    <span
      className={cn(
        "inline-flex items-center font-bold rounded-md",
        sizeClasses[size],
        className
      )}
      style={{ color: '#166534' }}
    >
      ✓ Verified
    </span>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-pointer">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">This entity has been verified</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
