import { toast } from "sonner";
import type { NavigateFunction } from "react-router-dom";

interface GuardArgs {
  user: { id: string } | null | undefined;
  profile: { kyc_status?: string | null; kyc_submitted_at?: string | null } | null | undefined;
  featureLabel: string;
  navigate: NavigateFunction;
  intendedPath: string;
}

/**
 * Centralized guard for any "create" action across the platform.
 *
 * - If signed out: stores the intended path so /auth can return them after
 *   login, shows a clear toast, navigates to /auth, returns false.
 * - If signed in but KYC is not approved: shows a feature-specific toast
 *   and routes to the most useful next page (KYC upload or profile),
 *   returns false.
 * - If signed in and KYC approved: returns true so the caller can proceed.
 */
export function guardCreateAction({
  user,
  profile,
  featureLabel,
  navigate,
  intendedPath,
}: GuardArgs): boolean {
  if (!user) {
    try {
      sessionStorage.setItem("postLoginRedirect", intendedPath);
    } catch {
      /* noop */
    }
    toast.info(`Please log in to create a ${featureLabel}`);
    navigate("/auth", { replace: false });
    return false;
  }

  const status = profile?.kyc_status;
  if (status === "approved") return true;

  if (status === "pending" || profile?.kyc_submitted_at) {
    toast.info(
      `Your verification is under review — you can create a ${featureLabel} once it's approved.`
    );
    navigate("/profile");
    return false;
  }

  if (status === "rejected") {
    toast.error(
      `Your verification was rejected. Please resubmit to create a ${featureLabel}.`
    );
    navigate("/kyc-upload");
    return false;
  }

  toast.warning(`Verify your identity first to create a ${featureLabel}.`);
  navigate("/kyc-upload");
  return false;
}
