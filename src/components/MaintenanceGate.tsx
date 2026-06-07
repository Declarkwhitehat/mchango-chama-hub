import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert, Wrench } from "lucide-react";

type MaintenanceSetting = {
  enabled?: boolean;
  text?: string;
};

interface MaintenanceGateProps {
  children: ReactNode;
}

const defaultTitle = "Scheduled maintenance";
const defaultMessage = "We are doing upgrades and system maintenance. Please check back shortly.";

export function MaintenanceGate({ children }: MaintenanceGateProps) {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);

  useEffect(() => {
    let mounted = true;

    const fetchState = async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("setting_key, setting_value")
          .in("setting_key", ["maintenance_mode", "maintenance_title", "maintenance_message"]);

        if (error) throw error;

        if (!mounted) return;

        const map = (data ?? []).reduce<Record<string, MaintenanceSetting>>((acc, row: any) => {
          acc[row.setting_key] = row.setting_value ?? {};
          return acc;
        }, {});

        setEnabled(Boolean(map.maintenance_mode?.enabled));
        setTitle(map.maintenance_title?.text || defaultTitle);
        setMessage(map.maintenance_message?.text || defaultMessage);
      } catch (error) {
        console.error("Failed to fetch maintenance state", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchState();

    const channel = supabase
      .channel("platform-settings-maintenance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_settings" },
        (payload) => {
          const key = payload.new && typeof payload.new === "object" ? (payload.new as Record<string, unknown>).setting_key : null;
          if (key === "maintenance_mode" || key === "maintenance_title" || key === "maintenance_message") {
            fetchState();
          }
        }
      )
      .subscribe();

    const onVisible = () => { if (!document.hidden) fetchState(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchState);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchState);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchAdminState = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) setIsAdmin(false);
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (active) setIsAdmin(Boolean(data));
    };

    fetchAdminState();
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const bypassMaintenance = useMemo(() => {
    return location.pathname.startsWith("/admin") || isAdmin;
  }, [location.pathname, isAdmin]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!enabled || bypassMaintenance) {
    return <>{children}</>;
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-16">
      <section className="w-full max-w-2xl space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border bg-card">
          <Wrench className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-3">
          <Badge variant="destructive" className="mx-auto">Maintenance mode</Badge>
          <h1 className="text-4xl font-bold tracking-tight">{title.trim() || defaultTitle}</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">{message.trim() || defaultMessage}</p>
        </div>
        <div className="rounded-lg border bg-card p-5 flex flex-col sm:flex-row gap-3 items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            The system is temporarily unavailable while upgrades are being completed.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
          <Loader2 className="h-4 w-4" />
          Check again
        </Button>
      </section>
    </main>
  );
}
