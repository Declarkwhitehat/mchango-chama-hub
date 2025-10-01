import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireKYC?: boolean;
}

export const ProtectedRoute = ({ children, requireKYC = false }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      toast.error("Please log in to continue");
      navigate("/auth");
      return;
    }

    if (requireKYC && profile) {
      if (!profile.kyc_submitted_at) {
        toast.error("Please complete KYC verification first");
        navigate("/kyc-upload");
        return;
      }

      if (profile.kyc_status !== 'approved') {
        toast.error(`Your KYC status is: ${profile.kyc_status}. Only approved users can access this feature.`);
        navigate("/home");
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
