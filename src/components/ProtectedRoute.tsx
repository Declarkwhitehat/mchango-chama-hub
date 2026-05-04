import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireKYC?: boolean;
}

export const ProtectedRoute = ({ children, requireKYC = false }: ProtectedRouteProps) => {
  const { user, profile, loading, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectAttemptRef = useRef<number>(0);
  const lastRedirectRef = useRef<number>(0);
  const initialGraceRef = useRef<boolean>(true);
  const [pinChecked, setPinChecked] = useState(false);
  const pinCheckingRef = useRef(false);

  // Check if user has PIN set up (skip for /pin-setup route itself)
  useEffect(() => {
    if (loading || !user || !session || location.pathname === '/pin-setup') {
      setPinChecked(true);
      return;
    }
    if (pinCheckingRef.current) return;
    pinCheckingRef.current = true;

    const checkPin = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/pin-management`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: 'check-pin-status' }),
        });
        const data = await response.json();
        if (!data.has_pin) {
          sessionStorage.setItem('pinSetupReturnTo', location.pathname);
          toast.info("Please set up your security PIN to continue");
          navigate('/pin-setup', { replace: true });
          return;
        }
      } catch (err) {
        console.error('PIN check failed:', err);
      }
      setPinChecked(true);
      pinCheckingRef.current = false;
    };
    checkPin();
  }, [user, session, loading, location.pathname]);

  useEffect(() => {
    if (loading) return;

    const now = Date.now();

    if (initialGraceRef.current) {
      initialGraceRef.current = false;
      const t = setTimeout(() => {}, 700);
      return () => clearTimeout(t);
    }

    if (now - lastRedirectRef.current < 3000) return;

    if (!user) {
      if (redirectAttemptRef.current === 0 || now - lastRedirectRef.current > 5000) {
        toast.error("Please log in to continue");
        redirectAttemptRef.current++;
      }
      lastRedirectRef.current = now;
      navigate("/auth", { replace: true });
      return;
    }

    redirectAttemptRef.current = 0;

    // Note: KYC enforcement is intentionally handled inline by <KycGate /> on
    // each page that needs it, so users see a clear status card (upload vs
    // wait-for-review vs rejected) instead of being redirected to a blank
    // screen with a generic toast. The `requireKYC` prop is kept for API
    // compatibility but is now a no-op at the route level.
  }, [user, profile, loading, requireKYC, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return null;
  // KYC gating is now handled inside the page via <KycGate />, so we always
  // render children here once auth + PIN checks pass.
  if (!pinChecked && location.pathname !== '/pin-setup') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
};
