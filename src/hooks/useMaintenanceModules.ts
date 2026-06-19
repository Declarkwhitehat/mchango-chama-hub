import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MaintenanceModuleKey = "global" | "chama" | "welfare" | "donations" | "withdrawals";

export type MaintenanceModuleState = { enabled: boolean; since: string | null };

export type MaintenanceModulesMap = Record<MaintenanceModuleKey, MaintenanceModuleState>;

const DEFAULTS: MaintenanceModulesMap = {
  global: { enabled: false, since: null },
  chama: { enabled: false, since: null },
  welfare: { enabled: false, since: null },
  donations: { enabled: false, since: null },
  withdrawals: { enabled: false, since: null },
};

function parse(raw: any): MaintenanceModulesMap {
  const out: MaintenanceModulesMap = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  (Object.keys(DEFAULTS) as MaintenanceModuleKey[]).forEach((k) => {
    const v = raw[k];
    if (v && typeof v === "object") {
      out[k] = { enabled: Boolean(v.enabled), since: v.since ?? null };
    }
  });
  return out;
}

export function useMaintenanceModules() {
  const [modules, setModules] = useState<MaintenanceModulesMap>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchState = async () => {
      try {
        const { data } = await supabase
          .from("platform_settings")
          .select("setting_value")
          .eq("setting_key", "maintenance_modules")
          .maybeSingle();
        if (!mounted) return;
        setModules(parse((data as any)?.setting_value));
      } catch (e) {
        console.error("maintenance modules fetch failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchState();

    const channel = supabase
      .channel("platform-settings-maintenance-modules")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_settings" },
        (payload: any) => {
          const key = payload?.new?.setting_key;
          if (key === "maintenance_modules") fetchState();
        }
      )
      .subscribe();

    const onVisible = () => { if (!document.hidden) fetchState(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { modules, loading };
}

export function useIsModuleInMaintenance(module: Exclude<MaintenanceModuleKey, "global">) {
  const { modules, loading } = useMaintenanceModules();
  return { inMaintenance: modules[module].enabled, since: modules[module].since, loading };
}
