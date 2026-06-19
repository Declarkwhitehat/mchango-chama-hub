// Shared helper for super-admin edge functions.
// Verifies the caller's JWT and confirms they have the `super_admin` role.
// Throws (with appropriate HTTP status hints in the error message) on failure.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface SuperAdminCheckResult {
  userId: string;
  email: string | null;
}

export async function requireSuperAdmin(req: Request): Promise<SuperAdminCheckResult> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Error("UNAUTHENTICATED:Missing Authorization header");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new Error("UNAUTHENTICATED:Invalid session");
  }

  const userId = userData.user.id;
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  if (rolesError) throw new Error(`FORBIDDEN:Role lookup failed: ${rolesError.message}`);
  if (!roles) throw new Error("FORBIDDEN:Super admin only");

  return { userId, email: userData.user.email ?? null };
}

export async function logServerAdminAction(
  actorUserId: string,
  actorEmail: string | null,
  actionKey: string,
  opts: { targetType?: string; targetId?: string | null; metadata?: Record<string, unknown>; ipAddress?: string | null; userAgent?: string | null } = {}
) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await admin.from("admin_action_log").insert({
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      action_key: actionKey,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      metadata: opts.metadata ?? {},
      ip_address: opts.ipAddress ?? null,
      user_agent: opts.userAgent ?? null,
    });
  } catch (e) {
    console.warn("logServerAdminAction failed", actionKey, e);
  }
}
