import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireKYC?: boolean;
}

export const ProtectedRoute = ({ children, requireKYC = false }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const redirectAttemptRef = useRef<number>(0);
  const lastRedirectRef = useRef<number>(0);
  const initialGraceRef = useRef<boolean>(true);

useEffect(() => {
  if (loading) return;

  const now = Date.now();

  // One-time grace period (700ms) after loading completes to allow session restoration
  if (initialGraceRef.current) {
    initialGraceRef.current = false;
    const t = setTimeout(() => {
      // no-op, grace window elapsed
    }, 700);
    return () => clearTimeout(t);
  }

  // Debounce redirects: only allow one redirect every 3 seconds
  if (now - lastRedirectRef.current < 3000) {
    return;
  }

  if (!user) {
    // Only show toast on first attempt or after 5 seconds
    if (redirectAttemptRef.current === 0 || now - lastRedirectRef.current > 5000) {
      toast.error("Please log in to continue");
      redirectAttemptRef.current++;
    }
    lastRedirectRef.current = now;
    navigate("/auth", { replace: true });
    return;
  }

  // Reset counter on successful auth
  redirectAttemptRef.current = 0;

  if (requireKYC && profile) {
    if (!profile.kyc_submitted_at) {
      toast.error("Please complete KYC verification first");
      lastRedirectRef.current = now;
      navigate("/kyc-upload", { replace: true });
      return;
    }

    if (profile.kyc_status !== 'approved') {
      toast.error(`Your KYC status is: ${profile.kyc_status}. Only approved users can access this feature.`);
      lastRedirectRef.current = now;
      navigate("/home", { replace: true });
      return;
    }
  }
}, [user, profile, loading, requireKYC, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireKYC && profile && profile.kyc_status !== 'approved') {
    return null;
  }

  return <>{children}</>;
};
