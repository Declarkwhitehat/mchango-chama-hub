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

  if (!user) return null;
  if (requireKYC && profile && profile.kyc_status !== 'approved') return null;
  if (!pinChecked && location.pathname !== '/pin-setup') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
};
