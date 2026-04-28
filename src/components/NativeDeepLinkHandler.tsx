import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Native deep-link handler.
 *
 * Listens for incoming URLs (Android intent filters / iOS universal links)
 * and routes them through React Router so shared campaign / org / chama
 * links land on the correct page inside the app — even for cold-starts,
 * guests, and unauthenticated users.
 *
 * Safely no-ops on web.
 */

const KNOWN_PUBLIC_HOSTS = new Set([
  "pamojanova.online",
  "www.pamojanova.online",
]);

const CUSTOM_SCHEMES = new Set(["pamoja"]);

// Routes that we should never override via deep-link (they're app-shell paths).
const NON_ACTIONABLE_PATHS = new Set(["", "/", "/home", "/auth"]);

const extractInAppPath = (rawUrl: string): string | null => {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim().replace(/[)\].,;!?]+$/g, "");

  try {
    const url = new URL(trimmed);
    const scheme = url.protocol.replace(":", "").toLowerCase();

    const isKnownHttp =
      (scheme === "https" || scheme === "http") &&
      KNOWN_PUBLIC_HOSTS.has(url.host);
    const isCustomScheme = CUSTOM_SCHEMES.has(scheme);

    if (!isKnownHttp && !isCustomScheme) return null;

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
  const location = useLocation();
  const pendingPathRef = useRef<string | null>(null);

  // Whenever a pending deep-link path is set, keep trying to route to it
  // until the current location actually matches. This survives cold-starts
  // where AuthContext / Index / other guards may navigate first.
  useEffect(() => {
    const pending = pendingPathRef.current;
    if (!pending) return;

    // Compare just the pathname portion to know when we've arrived.
    const currentPath = location.pathname + location.search + location.hash;
    const targetPath = pending.startsWith("/") ? pending : `/${pending}`;

    if (currentPath === targetPath || location.pathname === targetPath.split("?")[0].split("#")[0]) {
      // Arrived — clear the pending path.
      pendingPathRef.current = null;
      return;
    }

    // Not yet at the target. Re-navigate.
    console.info("[DeepLink] Re-asserting pending route:", targetPath, "from", currentPath);
    navigate(targetPath, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isNative) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const setPendingAndRoute = (rawUrl: string) => {
      const path = extractInAppPath(rawUrl);
      if (!path) return;
      if (NON_ACTIONABLE_PATHS.has(path)) return;
      console.info("[DeepLink] Setting pending route:", path);
      pendingPathRef.current = path;
      // Kick off an immediate navigate; the location-watcher useEffect above
      // will keep re-asserting until we actually land there.
      try {
        navigate(path, { replace: true });
      } catch (e) {
        console.warn("[DeepLink] Initial navigate failed (will retry):", e);
      }

      // Hard fallback: clear the pending path after 8s no matter what so we
      // never trap the user on a stale redirect target.
      setTimeout(() => {
        pendingPathRef.current = null;
      }, 8000);
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        // Cold-start launch URL — the app was opened directly via a link.
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            console.info("[DeepLink] Cold-start launch URL:", launch.url);
            // Defer slightly so React Router has mounted, then set pending.
            setTimeout(() => {
              if (!cancelled) setPendingAndRoute(launch.url);
            }, 200);
          }
        } catch (error) {
          console.warn("[DeepLink] getLaunchUrl failed (non-fatal):", error);
        }

        // Warm-start URL opens (link tapped while app is already running).
        const handle = await App.addListener("appUrlOpen", (event: { url: string }) => {
          console.info("[DeepLink] appUrlOpen:", event?.url);
          if (event?.url) setPendingAndRoute(event.url);
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
