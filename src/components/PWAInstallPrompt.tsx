import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Download } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
      return isStandalone;
    };

    if (checkIfInstalled()) {
      setShowPrompt(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      
      const dismissed = localStorage.getItem("pwa-install-dismissed");
      if (!dismissed && !checkIfInstalled()) {
        setShowPrompt(true);
      }
    };

    const manualInstallHandler = async () => {
      if (checkIfInstalled()) return;
      const prompt = deferredPromptRef.current;
      if (prompt) {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") {
          deferredPromptRef.current = null;
          setShowPrompt(false);
          toast.success("Pamoja App installed successfully!");
        }
      } else {
        toast.info("To install Pamoja, tap your browser's menu (⋮ or share icon) and select 'Add to Home Screen'.", { duration: 6000 });
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("triggerPWAInstall", manualInstallHandler);

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      if (mediaQuery.matches) {
        setIsInstalled(true);
        setShowPrompt(false);
      }
    };
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("triggerPWAInstall", manualInstallHandler);
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) {
      toast.info("To install Pamoja, tap your browser's menu (⋮ or share icon) and select 'Add to Home Screen'.", { duration: 6000 });
      return;
    }

    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      deferredPromptRef.current = null;
      setShowPrompt(false);
      toast.success("Pamoja App installed successfully!");
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <Card className="fixed bottom-[calc(var(--bottom-nav-offset)+16px)] left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 shadow-lg border-primary">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Download className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Install Pamoja App</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Install our app for a better experience with offline access and faster loading.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleInstall} size="sm" className="flex-1">
              Install
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
