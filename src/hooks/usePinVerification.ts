import { useState, useCallback } from "react";

/**
 * Hook to require PIN verification before sensitive actions.
 * Usage:
 *   const { requirePin, PinDialog } = usePinVerification();
 *   // Call requirePin(() => { /* action after PIN verified * / });
 *   // Render <PinDialog /> in your component
 */
export const usePinVerification = () => {
  const [showPin, setShowPin] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requirePin = useCallback((action: () => void) => {
    setPendingAction(() => action);
    setShowPin(true);
  }, []);

  const onVerified = useCallback(() => {
    setShowPin(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const onOpenChange = useCallback((open: boolean) => {
    setShowPin(open);
    if (!open) setPendingAction(null);
  }, []);

  return {
    showPin,
    requirePin,
    onVerified,
    onOpenChange,
  };
};
