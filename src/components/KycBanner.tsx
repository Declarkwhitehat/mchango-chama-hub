import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Clock, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type KycStatus = "approved" | "pending" | "rejected" | "not_submitted";

interface KycInfo {
  status: KycStatus;
  reason?: string | null;
}

/**
 * Global KYC banner. Shown on every page (via Layout) whenever the signed-in
 * user has not yet been fully approved. Auto-hides for approved users.
 */
export const KycBanner = () => {
  const { user } = useAuth();
  const [info, setInfo] = useState<KycInfo | null>(null);

  useEffect(() => {
    if (!user) {
      setInfo(null);
      return;
    }
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("kyc_status, kyc_submitted_at, kyc_rejection_reason")
        .eq("id", user.id)
        .maybeSingle();
      if (!active || !data) return;
      const status: KycStatus = !data.kyc_submitted_at
        ? "not_submitted"
        : (data.kyc_status as KycStatus) || "pending";
      setInfo({ status, reason: data.kyc_rejection_reason });
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user]);

  if (!user || !info || info.status === "approved") return null;

  if (info.status === "not_submitted") {
    return (
      <div className="w-full bg-amber-500/10 border-b border-amber-500/30">
        <div className="container px-4 py-2 flex items-center justify-between gap-2 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">Verify your identity to unlock all features.</span>
          </div>
          <Link to="/kyc-upload">
            <Button size="sm" variant="outline" className="h-7 text-xs">Submit KYC</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (info.status === "pending") {
    return (
      <div className="w-full bg-blue-500/10 border-b border-blue-500/30">
        <div className="container px-4 py-2 flex items-center gap-2 max-w-7xl mx-auto text-sm text-blue-700 dark:text-blue-400">
          <Clock className="h-4 w-4 shrink-0" />
          <span className="truncate">KYC submitted — under review. You'll get an SMS once decided.</span>
        </div>
      </div>
    );
  }

  // rejected
  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/30">
      <div className="container px-4 py-2 flex items-center justify-between gap-2 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-destructive min-w-0">
          <XCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">
            KYC rejected{info.reason ? `: ${info.reason}` : ""}. Please re-submit.
          </span>
        </div>
        <Link to="/kyc-upload">
          <Button size="sm" variant="destructive" className="h-7 text-xs">Re-submit</Button>
        </Link>
      </div>
    </div>
  );
};

export default KycBanner;
