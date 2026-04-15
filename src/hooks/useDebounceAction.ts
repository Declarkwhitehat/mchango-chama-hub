import { useState, useCallback, useRef } from "react";

/**
 * Wraps an async action to prevent double-submissions.
 * Returns { execute, isProcessing }.
 * While processing or during cooldown, subsequent calls are ignored.
 */
export function useDebounceAction<T extends (...args: any[]) => Promise<any>>(
  action: T,
  cooldownMs = 2000
) {
  const [isProcessing, setIsProcessing] = useState(false);
  const cooldownRef = useRef(false);

  const execute = useCallback(
    async (...args: Parameters<T>) => {
      if (isProcessing || cooldownRef.current) return;
      setIsProcessing(true);
      try {
        await action(...args);
      } finally {
        setIsProcessing(false);
        cooldownRef.current = true;
        setTimeout(() => {
          cooldownRef.current = false;
        }, cooldownMs);
      }
    },
    [action, cooldownMs, isProcessing]
  ) as (...args: Parameters<T>) => Promise<void>;

  return { execute, isProcessing };
}
