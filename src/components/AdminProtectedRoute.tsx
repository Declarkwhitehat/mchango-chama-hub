import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

export const AdminProtectedRoute = ({ children }: AdminProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  const checkAdminAccess = async () => {
    if (loading) return;

    if (!user) {
      console.log('AdminProtectedRoute: No user found, redirecting to auth');
      navigate("/auth");
      return;
    }

    try {
      console.log('AdminProtectedRoute: Checking admin access for user:', user.email);
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      console.log('AdminProtectedRoute: Admin check result:', { data, error });

      if (error) {
        console.error('AdminProtectedRoute: Error checking admin access:', error);
        toast({
          title: "Error",
          description: `Error verifying admin access: ${error.message}`,
          variant: "destructive",
        });
        navigate("/home");
        return;
      }

      if (!data) {
        console.log('AdminProtectedRoute: User is not an admin');
        toast({
          title: "Access Denied",
          description: `Admin privileges required. Current user: ${user.email}`,
          variant: "destructive",
        });
        navigate("/home");
        return;
      }

      console.log('AdminProtectedRoute: Admin access granted');
      setIsAdmin(true);
    } catch (error) {
      console.error('AdminProtectedRoute: Admin check error:', error);
      toast({
        title: "Error",
        description: "Error checking admin access",
        variant: "destructive",
      });
      navigate("/home");
    } finally {
      setChecking(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return <>{children}</>;
};