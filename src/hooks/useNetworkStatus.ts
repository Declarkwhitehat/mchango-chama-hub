import { useState, useEffect } from "react";
import { toast } from "sonner";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online", {
        description: "Your connection has been restored"
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline", {
        description: "Some features may be limited",
        duration: Infinity
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
