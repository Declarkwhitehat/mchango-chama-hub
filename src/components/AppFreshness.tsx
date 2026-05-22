import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App as CapApp } from "@capacitor/app";

/**
 * Keeps data fresh across the app on every "the user is paying attention again" signal:
 *  - Capacitor app resumes from background (native)
 *  - Tab becomes visible (web)
 *  - Network comes back online
 *
 * On each trigger:
 *  1) Invalidates ALL React Query caches so any useQuery() refetches.
 *  2) Dispatches a `window` event `app:refresh` so legacy useEffect/useState
 *     fetchers can subscribe and reload without rewriting them.
 *
 * Throttled to at most once every 2s to avoid storms.
 */
export const AppFreshness = () => {
  const queryClient = useQueryClient();
  const lastRef = useRef(0);

  useEffect(() => {
    const trigger = (reason: string) => {
      const now = Date.now();
      if (now - lastRef.current < 2000) return;
      lastRef.current = now;
      try {
        queryClient.invalidateQueries();
      } catch {
        // ignore
      }
      window.dispatchEvent(new CustomEvent("app:refresh", { detail: { reason } }));
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") trigger("visibility");
    };
    const onOnline = () => trigger("online");
    const onFocus = () => trigger("focus");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);

    let removeNative: undefined | (() => void);
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      const handle = CapApp.addListener("appStateChange", (state) => {
        if (state.isActive) trigger("native-resume");
      });
      removeNative = () => {
        Promise.resolve(handle).then((h) => h.remove()).catch(() => {});
      };
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      removeNative?.();
    };
  }, [queryClient]);

  return null;
};
