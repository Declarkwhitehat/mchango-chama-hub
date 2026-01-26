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
  sm: "h-[18px] w-[18px]",
  md: "h-[22px] w-[22px]",
  lg: "h-[28px] w-[28px]",
};

// Instagram/Facebook-style scalloped verification badge
const ScallopedBadge = ({ size, className }: { size: "sm" | "md" | "lg"; className?: string }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        sizeClasses[size],
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(59, 130, 246, 0.3))' }}
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id="verifiedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        {/* Scalloped/wavy circle path - Instagram-style */}
        <path
          d="M12 1.5C12.6 1.5 13.2 1.8 13.5 2.3L14.1 3.2C14.4 3.7 14.9 4 15.5 4.1L16.5 4.3C17.1 4.4 17.6 4.8 17.8 5.3C18 5.8 18 6.4 17.7 6.9L17.2 7.8C16.9 8.3 16.9 8.9 17 9.4L17.3 10.4C17.5 11 17.3 11.6 16.9 12C16.5 12.4 16.5 12.6 16.9 13C17.3 13.4 17.5 14 17.3 14.6L17 15.6C16.9 16.1 16.9 16.7 17.2 17.2L17.7 18.1C18 18.6 18 19.2 17.8 19.7C17.6 20.2 17.1 20.6 16.5 20.7L15.5 20.9C14.9 21 14.4 21.3 14.1 21.8L13.5 22.7C13.2 23.2 12.6 23.5 12 23.5C11.4 23.5 10.8 23.2 10.5 22.7L9.9 21.8C9.6 21.3 9.1 21 8.5 20.9L7.5 20.7C6.9 20.6 6.4 20.2 6.2 19.7C6 19.2 6 18.6 6.3 18.1L6.8 17.2C7.1 16.7 7.1 16.1 7 15.6L6.7 14.6C6.5 14 6.7 13.4 7.1 13C7.5 12.6 7.5 12.4 7.1 12C6.7 11.6 6.5 11 6.7 10.4L7 9.4C7.1 8.9 7.1 8.3 6.8 7.8L6.3 6.9C6 6.4 6 5.8 6.2 5.3C6.4 4.8 6.9 4.4 7.5 4.3L8.5 4.1C9.1 4 9.6 3.7 9.9 3.2L10.5 2.3C10.8 1.8 11.4 1.5 12 1.5Z"
          fill="url(#verifiedGradient)"
        />
        {/* White checkmark */}
        <path
          d="M9.5 12.5L11 14L14.5 10.5"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
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
          <span className="inline-flex cursor-pointer">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Verified</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
