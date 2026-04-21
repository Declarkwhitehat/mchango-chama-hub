import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const THRESHOLD = 80; // px to pull before triggering refresh
const MAX_PULL = 120;

interface PullToRefreshProps {
  children: ReactNode;
}

/**
 * Native-style pull-to-refresh wrapper.
 * On pull-down at the top of scroll, invalidates all React Query caches
 * and reloads the current page's data.
 * Only active on native (Capacitor) platforms.
 */
export const PullToRefresh = ({ children }: PullToRefreshProps) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

  const isAtTop = useCallback(() => {
    // Check if the page is scrolled to the very top
    return window.scrollY <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!isNative || isRefreshing) return;
      if (isAtTop()) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [isNative, isRefreshing, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0 && isAtTop()) {
        // Apply resistance curve
        const distance = Math.min(diff * 0.5, MAX_PULL);
        setPullDistance(distance);
        if (distance > 10) {
          e.preventDefault();
        }
      } else {
        pulling.current = false;
        setPullDistance(0);
      }
    },
    [isRefreshing, isAtTop]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(THRESHOLD / 2);
      try {
        await queryClient.invalidateQueries();
      } catch {
        // ignore
      }
      // Minimum visible feedback
      await new Promise((r) => setTimeout(r, 600));
      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, queryClient]);

  useEffect(() => {
    if (!isNative) return;
    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, opts);
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isNative, handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!isNative) return <>{children}</>;

  const showIndicator = pullDistance > 10 || isRefreshing;
  const ready = pullDistance >= THRESHOLD;

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center z-[60] pointer-events-none transition-opacity duration-200"
        style={{
          top: 56, // below sticky header
          height: showIndicator ? Math.max(pullDistance, 40) : 0,
          opacity: showIndicator ? 1 : 0,
        }}
      >
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full bg-card shadow-lg border border-border transition-transform duration-200 ${
            ready || isRefreshing ? "scale-100" : "scale-90"
          }`}
        >
          <Loader2
            className={`h-4 w-4 text-primary ${
              isRefreshing ? "animate-spin" : ""
            }`}
            style={{
              transform: isRefreshing
                ? undefined
                : `rotate(${(pullDistance / THRESHOLD) * 360}deg)`,
            }}
          />
          <span className="text-xs text-muted-foreground font-medium">
            {isRefreshing
              ? "Refreshing..."
              : ready
              ? "Release to refresh"
              : "Pull to refresh"}
          </span>
        </div>
      </div>

      {/* Content pushed down during pull */}
      <div
        style={{
          transform:
            pullDistance > 10
              ? `translateY(${pullDistance}px)`
              : undefined,
          transition: pulling.current ? "none" : "transform 0.25s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
};
