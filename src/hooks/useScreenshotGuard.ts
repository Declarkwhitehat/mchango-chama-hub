import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

/**
 * Blocks screenshots and screen recording on the current page (native only).
 * On Android, sets FLAG_SECURE via @capacitor-community/privacy-screen.
 * On web, this hook is a no-op.
 */
export function useScreenshotGuard() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let enabled = false;
    let PrivacyScreen: any = null;

    (async () => {
      try {
        const mod = await import("@capacitor-community/privacy-screen");
        PrivacyScreen = mod.PrivacyScreen;
        await PrivacyScreen.enable();
        enabled = true;
      } catch (e) {
        console.warn("[ScreenshotGuard] Failed to enable privacy screen", e);
      }
    })();

    // Soft reminder toast when the app resumes (user likely just attempted a screenshot).
    let lastHidden = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastHidden = Date.now();
      } else if (document.visibilityState === "visible") {
        const gap = Date.now() - lastHidden;
        // A screenshot attempt causes a very brief blur (< 1.5s). Longer gaps = real background switch.
        if (lastHidden && gap > 200 && gap < 1500) {
          toast.info("Screenshots are disabled here", {
            description:
              "For your account security, screenshots and screen recording are blocked on this page.",
          });
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (enabled && PrivacyScreen) {
        PrivacyScreen.disable().catch(() => {});
      }
    };
  }, []);
}
