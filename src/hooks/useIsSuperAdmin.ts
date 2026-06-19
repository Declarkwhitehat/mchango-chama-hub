import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns whether the currently signed-in user has the `super_admin` role.
 * Super admin is required for: creating/removing admins, SMS broadcast,
 * paybill/SMS balance, maintenance mode, payment & commission config,
 * revenue, financial ledger, commission analytics, audit logs, user deletion.
 */
export function useIsSuperAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) {
          setIsSuperAdmin(false);
          setLoading(false);
        }
        return;
      }
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin" as any)
          .maybeSingle();
        if (!cancelled) setIsSuperAdmin(!!data);
      } catch {
        if (!cancelled) setIsSuperAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { isSuperAdmin, loading };
}
