// Shared helper: check whether a module is in maintenance mode.
// Webhooks/callbacks must NEVER call this — they always record payments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ModuleKey = "chama" | "welfare" | "donations" | "withdrawals";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

export async function isModuleInMaintenance(module: ModuleKey): Promise<boolean> {
  try {
    const { data } = await admin
      .from("platform_settings")
      .select("setting_value")
      .eq("setting_key", "maintenance_modules")
      .maybeSingle();
    const val: any = (data as any)?.setting_value;
    return Boolean(val?.[module]?.enabled);
  } catch (e) {
    console.error("checkMaintenance failed", e);
    return false;
  }
}

export function maintenanceResponse(module: ModuleKey, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: "module_maintenance",
      module,
      message: `${module} is temporarily paused for maintenance. Please try again shortly.`,
    }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
