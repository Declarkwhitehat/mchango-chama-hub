import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { toast } from "@/hooks/use-toast";

interface SuperAdminProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Wraps a route so only super_admin can access it. Regular admins are
 * redirected to /admin with an explanatory toast.
 */
export const SuperAdminProtectedRoute = ({ children }: SuperAdminProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading } = useIsSuperAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || loading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!isSuperAdmin) {
      toast({
        title: "Super admin only",
        description: "This area is restricted to the super admin.",
        variant: "destructive",
      });
      navigate("/admin");
    }
  }, [user, authLoading, isSuperAdmin, loading, navigate]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return <>{children}</>;
};
