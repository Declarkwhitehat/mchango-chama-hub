import { supabase } from "@/integrations/supabase/client";

/**
 * Records a privileged admin action into the admin_action_log via the
 * SECURITY DEFINER `log_admin_action` RPC. Errors are swallowed so
 * logging never blocks the user flow.
 */
export async function logAdminAction(
  actionKey: string,
  opts: {
    targetType?: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
) {
  try {
    await (supabase.rpc as any)("log_admin_action", {
      _action_key: actionKey,
      _target_type: opts.targetType ?? null,
      _target_id: opts.targetId ?? null,
      _metadata: opts.metadata ?? {},
      _ip_address: null,
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (e) {
    console.warn("logAdminAction failed", actionKey, e);
  }
}
