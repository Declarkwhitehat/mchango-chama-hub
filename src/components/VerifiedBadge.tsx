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
  /** When true (default), shows only the blue check icon — inline-friendly next to names. */
  iconOnly?: boolean;
  label?: string;
}

const sizePx = {
  sm: 14,
  md: 18,
  lg: 22,
} as const;

const pillSize = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-xs px-2 py-0.5 gap-1",
  lg: "text-sm px-2.5 py-1 gap-1.5",
} as const;

/**
 * Twitter/Instagram-style blue verified checkmark.
 * Default = inline icon (use next to a name).
 * Pass iconOnly={false} to render a pill with "Verified" label.
 */
export const VerifiedBadge = ({
  className,
  size = "md",
  showTooltip = true,
  iconOnly = true,
  label = "Verified",
}: VerifiedBadgeProps) => {
  const px = sizePx[size];

  const icon = (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      aria-label="Verified"
      role="img"
      className={cn("inline-block align-[-2px] shrink-0", iconOnly && className)}
    >
      <path
        fill="#1d9bf0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
      />
      <path
        fill="#fff"
        d="M10.62 15.78l-3.4-3.4 1.41-1.41 1.99 1.99 4.99-4.99 1.41 1.41-6.4 6.4z"
      />
    </svg>
  );

  const node = iconOnly ? (
    icon
  ) : (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-full bg-[#1d9bf0]/10 text-[#1d83d3]",
        pillSize[size],
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </span>
  );

  if (!showTooltip) return node;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default">{node}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">Verified by PAMOJA NOVA</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
