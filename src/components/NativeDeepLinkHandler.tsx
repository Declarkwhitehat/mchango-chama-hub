import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Native deep-link handler.
 *
 * Listens for incoming URLs (Android intent filters / iOS universal links)
 * and routes them through React Router so shared campaign / org / chama
 * links land on the correct page inside the app.
 *
 * Safely no-ops on web.
 */
export const NativeDeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isNative) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const routeFromUrl = (rawUrl: string) => {
      try {
        const url = new URL(rawUrl);
        const path = `${url.pathname}${url.search}${url.hash}`;
        if (path && path !== "/") {
          navigate(path, { replace: false });
        }
      } catch (error) {
        console.warn("[DeepLink] Could not parse URL:", rawUrl, error);
      }
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        // Handle cold-start launch URL.
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) routeFromUrl(launch.url);
        } catch (error) {
          console.warn("[DeepLink] getLaunchUrl failed (non-fatal):", error);
        }

        // Handle warm-start URL opens.
        const handle = await App.addListener("appUrlOpen", (event: { url: string }) => {
          if (event?.url) routeFromUrl(event.url);
        });

        cleanup = () => {
          try {
            handle?.remove?.();
          } catch {
            /* ignore */
          }
        };
      } catch (error) {
        console.warn("[DeepLink] App plugin unavailable (non-fatal):", error);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate]);

  return null;
};
