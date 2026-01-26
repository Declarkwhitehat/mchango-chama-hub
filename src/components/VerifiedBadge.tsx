import { Check } from "lucide-react";
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

const checkSizeClasses = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-3.5 w-3.5",
};

// SVG path for scalloped/wavy circle border
const ScallopedBadge = ({ size, className }: { size: "sm" | "md" | "lg"; className?: string }) => {
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center shrink-0",
        sizeClasses[size],
        className
      )}
    >
      {/* Scalloped background */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="badgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <path
          d="M12 2C12.8 2 13.5 2.5 13.8 3.2L14.5 4.8C14.7 5.3 15.1 5.7 15.6 5.9L17.2 6.6C17.9 6.9 18.4 7.6 18.4 8.4C18.4 8.8 18.3 9.2 18.1 9.5L17.1 11.1C16.8 11.5 16.7 12 16.8 12.5L17.2 14.2C17.4 15 17.1 15.8 16.4 16.3C16 16.5 15.6 16.6 15.2 16.6L13.5 16.3C13 16.2 12.5 16.3 12.1 16.6L10.6 17.7C9.9 18.2 9 18.2 8.3 17.7L6.8 16.6C6.4 16.3 5.9 16.2 5.4 16.3L3.7 16.6C2.9 16.7 2.1 16.3 1.7 15.6C1.5 15.2 1.4 14.8 1.5 14.4L1.9 12.7C2 12.2 1.9 11.7 1.6 11.3L0.6 9.7C0.2 9 0.2 8.1 0.7 7.4C1 7 1.4 6.7 1.9 6.6L3.6 6.1C4.1 6 4.5 5.7 4.8 5.3L5.7 3.6C6.1 2.9 6.9 2.5 7.7 2.6C8.1 2.6 8.5 2.8 8.8 3L10.3 4.2C10.7 4.5 11.2 4.6 11.7 4.5L13.4 4C13.6 3.9 13.8 3.9 14 3.9"
          fill="url(#badgeGradient)"
        />
        {/* Simplified scalloped circle */}
        <circle cx="12" cy="12" r="9" fill="url(#badgeGradient)" />
        {/* Scalloped edge effect */}
        <path
          d="M12 1.5c.97 0 1.84.52 2.32 1.35l.43.75c.23.4.6.7 1.03.85l.8.28c.91.32 1.55 1.14 1.62 2.1.03.45-.06.9-.27 1.3l-.4.78c-.2.4-.28.85-.22 1.3l.12.83c.13.95-.27 1.89-1.03 2.43-.36.26-.77.42-1.2.48l-.83.1c-.45.06-.87.25-1.2.55l-.63.57c-.68.61-1.64.75-2.46.36-.39-.18-.72-.47-.97-.82l-.47-.67c-.24-.35-.58-.62-.97-.77l-.75-.3c-.83-.33-1.41-1.08-1.5-1.94-.04-.4.02-.82.17-1.2l.3-.76c.15-.39.18-.82.08-1.22l-.2-.8c-.21-.87.08-1.78.75-2.36.32-.28.71-.46 1.12-.53l.82-.13c.44-.07.84-.27 1.16-.57l.6-.56c.66-.62 1.6-.78 2.43-.42.4.17.74.45 1 .8l.5.69c.25.34.6.6 1 .73l.78.27c.87.3 1.48 1.07 1.57 1.94.04.41-.02.83-.18 1.22l-.32.78c-.16.4-.2.83-.1 1.25l.18.8c.2.88-.1 1.8-.78 2.38-.32.27-.7.45-1.1.52l-.82.14c-.43.07-.83.28-1.15.58l-.6.57c-.67.63-1.62.79-2.46.41-.4-.18-.74-.46-1-.82l-.5-.69c-.24-.34-.58-.6-.97-.74l-.76-.27c-.86-.3-1.47-1.06-1.56-1.93-.04-.4.02-.82.17-1.21l.3-.77c.15-.39.18-.82.08-1.23l-.2-.8c-.2-.88.1-1.8.78-2.37.32-.27.7-.45 1.1-.51l.82-.13c.43-.07.83-.27 1.15-.58l.6-.57C10.4 1.87 11.18 1.5 12 1.5z"
          fill="url(#badgeGradient)"
        />
      </svg>
      {/* White checkmark */}
      <Check 
        className={cn(
          "relative z-10 text-white stroke-[3]",
          checkSizeClasses[size]
        )} 
      />
    </div>
  );
};

export const VerifiedBadge = ({
  className,
  size = "md",
  showTooltip = true,
}: VerifiedBadgeProps) => {
  const badge = <ScallopedBadge size={size} className={className} />;

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
          <p className="text-xs font-medium">Verified</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
