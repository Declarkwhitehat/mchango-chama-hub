import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Smartphone } from "lucide-react";
import { isPWAMode } from "@/lib/utils";

const APK_DOWNLOAD_URL = "https://github.com/Iamkingsleyyy/pamojanova/releases/latest/download/app-debug.apk";

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Don't show in preview/dev
    const isPreviewOrDev =
      window.location.hostname.includes("lovable.app") ||
      window.location.hostname.includes("localhost") ||
      window.location.hostname.includes("127.0.0.1");
    if (isPreviewOrDev) return;

    // Don't show if already in app (PWA or native)
    if (isPWAMode()) return;

    // Only show on mobile browsers (users who haven't installed yet)
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobileDevice) return;

    // Check if dismissed
    const dismissed = localStorage.getItem("app-download-dismissed");
    if (!dismissed) {
      setShowPrompt(true);
    }
  }, []);

  const handleDownload = () => {
    window.open(APK_DOWNLOAD_URL, "_blank");
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("app-download-dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <Card className="fixed bottom-[calc(var(--bottom-nav-offset,64px)+16px)] left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 shadow-lg border-primary">
      <div className="flex items-start gap-3">
        <img
          src="/pwa-192x192.png"
          alt="Pamoja App"
          className="w-12 h-12 rounded-xl flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">Download Pamoja App</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Get the full app experience — faster, with fingerprint login &amp; offline access.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleDownload} size="sm" className="flex-1 gap-1.5">
              <Smartphone className="h-4 w-4" />
              Download APK
            </Button>
            <Button onClick={handleDismiss} variant="outline" size="sm">
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
