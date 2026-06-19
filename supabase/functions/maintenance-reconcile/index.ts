// Sweeps payments that arrived while a module was in maintenance and
// completes/allocates them. Webhooks were always allowed to write — this
// pass just re-runs the allocation paths over the maintenance window.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ModuleKey = "chama" | "welfare" | "donations" | "withdrawals";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

async function requireSuperAdmin(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: userRes } = await admin.auth.getUser(token);
  const uid = userRes?.user?.id;
  if (!uid) return null;
  const { data } = await admin.rpc("is_super_admin", { _user_id: uid });
  return data === true ? uid : null;
}

async function sweepChama(since: string) {
  // Pending STK/c2b transactions for chama in the window
  const { data: txns } = await admin
    .from("transactions")
    .select("id, status, created_at, metadata")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(500);
  const scanned = txns?.length ?? 0;
  let recovered = 0;
  for (const t of txns ?? []) {
    try {
      // Re-query status from M-Pesa via existing edge function
      const { data, error } = await admin.functions.invoke("payment-stk-query", {
        body: { transaction_id: (t as any).id },
      });
      if (!error && (data as any)?.completed) recovered += 1;
    } catch (_) { /* ignore */ }
  }
  return { scanned, recovered };
}

async function sweepWelfare(since: string) {
  const { data: rows } = await admin
    .from("welfare_contributions")
    .select("id, status, created_at")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(500);
  const scanned = rows?.length ?? 0;
  let recovered = 0;
  for (const r of rows ?? []) {
    try {
      const { data, error } = await admin.functions.invoke("payment-stk-query", {
        body: { welfare_contribution_id: (r as any).id },
      });
      if (!error && (data as any)?.completed) recovered += 1;
    } catch (_) { /* ignore */ }
  }
  return { scanned, recovered };
}

async function sweepDonations(since: string) {
  let recovered = 0;
  let scanned = 0;
  const { data: mchango } = await admin
    .from("mchango_donations")
    .select("id, status, created_at")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(500);
  const { data: org } = await admin
    .from("organization_donations")
    .select("id, status, created_at")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(500);
  scanned = (mchango?.length ?? 0) + (org?.length ?? 0);
  for (const d of mchango ?? []) {
    try {
      const { data, error } = await admin.functions.invoke("payment-stk-query", {
        body: { mchango_donation_id: (d as any).id },
      });
      if (!error && (data as any)?.completed) recovered += 1;
    } catch (_) { /* ignore */ }
  }
  for (const d of org ?? []) {
    try {
      const { data, error } = await admin.functions.invoke("payment-stk-query", {
        body: { organization_donation_id: (d as any).id },
      });
      if (!error && (data as any)?.completed) recovered += 1;
    } catch (_) { /* ignore */ }
  }
  return { scanned, recovered };
}

async function sweepWithdrawals(since: string) {
  const { data: rows } = await admin
    .from("withdrawals")
    .select("id, status, created_at")
    .in("status", ["processing", "pending"])
    .gte("created_at", since)
    .limit(500);
  const scanned = rows?.length ?? 0;
  let recovered = 0;
  for (const w of rows ?? []) {
    try {
      const { data, error } = await admin.functions.invoke("b2c-status-query", {
        body: { withdrawal_id: (w as any).id },
      });
      if (!error && (data as any)?.completed) recovered += 1;
    } catch (_) { /* ignore */ }
  }
  return { scanned, recovered };
}

async function notifySuperAdmins(module: ModuleKey, scanned: number, recovered: number) {
  const { data: roles } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");
  const ids = (roles ?? []).map((r: any) => r.user_id);
  if (!ids.length) return;
  const rows = ids.map((user_id: string) => ({
    user_id,
    type: "system",
    title: `Reconciliation complete: ${module}`,
    message: `Scanned ${scanned} payment(s), recovered ${recovered}.`,
  }));
  await admin.from("notifications").insert(rows);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const uid = await requireSuperAdmin(req);
    if (!uid) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const module: ModuleKey = body.module;
    const since: string = body.since;
    if (!module || !since) {
      return new Response(JSON.stringify({ error: "missing module or since" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let result: { scanned: number; recovered: number };
    switch (module) {
      case "chama": result = await sweepChama(since); break;
      case "welfare": result = await sweepWelfare(since); break;
      case "donations": result = await sweepDonations(since); break;
      case "withdrawals": result = await sweepWithdrawals(since); break;
      default:
        return new Response(JSON.stringify({ error: "unknown module" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    await notifySuperAdmins(module, result.scanned, result.recovered);
    // log
    try {
      await admin.from("admin_action_log").insert({
        actor_user_id: uid,
        action_key: "maintenance.reconcile",
        target_type: module,
        metadata: { since, ...result },
      });
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ module, since, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    console.error("maintenance-reconcile failed", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
