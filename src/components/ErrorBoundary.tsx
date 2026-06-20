import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = "__chunk_reload_attempt__";

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return (
    error.name === "ChunkLoadError" ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed")
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);

    // Auto-recover from stale-bundle chunk load errors (post-deploy hash mismatch).
    // Only try once per session to avoid reload loops.
    if (isChunkLoadError(error) && typeof window !== "undefined") {
      try {
        const attempted = sessionStorage.getItem(CHUNK_RELOAD_KEY);
        if (!attempted) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage unavailable — fall through to UI
      }
    }

    // Fire-and-forget sampled telemetry (1% of errors) to keep load minimal.
    try {
      if (Math.random() < 0.01 && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-telemetry`;
        const blob = new Blob(
          [
            JSON.stringify({
              type: "error",
              name: error.name,
              message: (error.message || "").slice(0, 500),
              stack: (error.stack || "").slice(0, 1000),
              url: window.location.href,
              ua: navigator.userAgent.slice(0, 200),
              ts: Date.now(),
            }),
          ],
          { type: "application/json" }
        );
        navigator.sendBeacon(url, blob);
      }
    } catch {
      // ignore
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {}
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-2" />
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try again.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={this.handleRetry}>Try Again</Button>
                <Button variant="outline" onClick={this.handleHardReload}>
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
