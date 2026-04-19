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

const KNOWN_PUBLIC_HOSTS = new Set([
  "pamojanova.online",
  "www.pamojanova.online",
]);

const CUSTOM_SCHEMES = new Set(["pamoja"]);

/**
 * Extract the in-app path from any incoming URL string.
 * Returns null if the URL is not actionable (e.g. plain localhost root).
 */
const extractInAppPath = (rawUrl: string): string | null => {
  if (!rawUrl) return null;

  // Trim accidental whitespace/punctuation that often comes from share text.
  const trimmed = rawUrl.trim().replace(/[)\].,;!?]+$/g, "");

  try {
    const url = new URL(trimmed);
    const scheme = url.protocol.replace(":", "").toLowerCase();

    // Only handle our public domain or our custom scheme. Ignore localhost,
    // capacitor://, file://, etc. — those are just the app's own shell URLs.
    const isKnownHttp =
      (scheme === "https" || scheme === "http") &&
      KNOWN_PUBLIC_HOSTS.has(url.host);
    const isCustomScheme = CUSTOM_SCHEMES.has(scheme);

    if (!isKnownHttp && !isCustomScheme) return null;

    // For pamoja://mchango/slug the path lives in url.pathname; for custom
    // schemes the host is sometimes the first segment, so reconstruct safely.
    let path = `${url.pathname}${url.search}${url.hash}`;
    if (isCustomScheme && (!url.pathname || url.pathname === "/")) {
      path = `/${url.host}${url.search}${url.hash}`;
    }

    if (!path || path === "/") return null;
    return path;
  } catch (error) {
    console.warn("[DeepLink] Could not parse URL:", rawUrl, error);
    return null;
  }
};

export const NativeDeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isNative) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const routeFromUrl = (rawUrl: string) => {
      const path = extractInAppPath(rawUrl);
      if (!path) return;
      console.info("[DeepLink] Routing to", path);
      navigate(path, { replace: true });
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        // Handle cold-start launch URL — defer one tick so React Router has
        // mounted before we navigate.
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            setTimeout(() => routeFromUrl(launch.url), 0);
          }
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
