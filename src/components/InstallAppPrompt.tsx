import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=online.pamojanova.pamoja";

const BANNER_DISMISS_KEY = "pn_install_banner_dismissed_at";
const MODAL_SHOWN_KEY = "pn_install_modal_shown_at";
const BANNER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MODAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SHARED_PATH_PREFIXES = [
  "/mchango/",
  "/chama/",
  "/welfare/",
  "/organizations/",
];

const isSharedLinkPath = (pathname: string) => {
  // Exclude list/create routes — only true detail/share targets
  if (
    pathname === "/mchango" ||
    pathname === "/chama" ||
    pathname === "/welfare" ||
    pathname === "/organizations"
  )
    return false;
  if (
    pathname.endsWith("/create") ||
    pathname.includes("/join/") ||
    pathname.startsWith("/explore/")
  )
    return false;
  return SHARED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
};

const isNative = () =>
  typeof window !== "undefined" &&
  !!(window as any).Capacitor?.isNativePlatform?.();

const isAndroid = () =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

const readTs = (key: string): number => {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
};

const writeTs = (key: string) => {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
};

export const InstallAppPrompt = () => {
  const location = useLocation();
  const [bannerHidden, setBannerHidden] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  // On native, never render anything.
  const nativeApp = isNative();

  useEffect(() => {
    if (nativeApp) return;
    // Hide on auth pages and admin
    const path = location.pathname;
    if (
      path.startsWith("/admin") ||
      path === "/auth" ||
      path === "/forgot-password" ||
      path === "/reset-password"
    ) {
      setBannerHidden(true);
      return;
    }
    const dismissedAt = readTs(BANNER_DISMISS_KEY);
    setBannerHidden(Date.now() - dismissedAt < BANNER_TTL_MS);
  }, [location.pathname, nativeApp]);

  // Auto-open modal on shared-link detail pages once per 24h
  useEffect(() => {
    if (nativeApp) return;
    if (!isSharedLinkPath(location.pathname)) return;
    const lastShown = readTs(MODAL_SHOWN_KEY);
    if (Date.now() - lastShown < MODAL_TTL_MS) return;
    const t = setTimeout(() => {
      setModalOpen(true);
      writeTs(MODAL_SHOWN_KEY);
    }, 1200);
    return () => clearTimeout(t);
  }, [location.pathname, nativeApp]);

  if (nativeApp) return null;

  const dismissBanner = () => {
    writeTs(BANNER_DISMISS_KEY);
    setBannerHidden(true);
  };

  const openStore = () => {
    window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {/* Sticky install banner */}
      {!bannerHidden && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pointer-events-none">
          <div
            role="region"
            aria-label="Install Pamojanova app"
            className="pointer-events-auto mx-auto max-w-3xl rounded-xl border bg-card/95 backdrop-blur shadow-lg p-3 flex items-center gap-3"
          >
            <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">
                Get the Pamojanova app
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                Faster, secure & built for {isAndroid() ? "your phone" : "Android"}.
              </p>
            </div>
            <Button size="sm" onClick={openStore} className="gap-1">
              <Download className="h-4 w-4" />
              Install
            </Button>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss install banner"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal for shared link visitors */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Open in the Pamojanova app
            </DialogTitle>
            <DialogDescription>
              For the best experience contributing, sharing, and tracking this
              page, install the free Pamojanova app from Google Play.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>✓ Instant M-Pesa payments</p>
            <p>✓ Real-time notifications</p>
            <p>✓ Secure login with biometrics</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Continue in browser
            </Button>
            <Button onClick={openStore} className="gap-1">
              <Download className="h-4 w-4" />
              Install app
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallAppPrompt;
