import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ONFON_API_KEY = Deno.env.get("ONFON_API_KEY");
const ONFON_CLIENT_ID = Deno.env.get("ONFON_CLIENT_ID");
const ONFON_SENDER_ID = Deno.env.get("ONFON_SENDER_ID");

async function sendSMS(phone: string, message: string) {
  try {
    const normalized = (phone.startsWith("+") ? phone.slice(1) : phone).replace(/\D/g, "");
    await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SenderId: ONFON_SENDER_ID,
        IsUnicode: false, IsFlash: false,
        MessageParameters: [{ Number: normalized, Text: message }],
        ApiKey: ONFON_API_KEY, ClientId: ONFON_CLIENT_ID,
      }),
    });
  } catch (e) { console.error("SMS error", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await anon.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const requestId = String(body?.request_id ?? "");
    const decision = String(body?.decision ?? ""); // 'approve' | 'reject'
    const admin_notes = body?.admin_notes ? String(body.admin_notes) : null;
    const validity_days = Number(body?.validity_days ?? 30);

    if (!requestId || !["approve", "reject"].includes(decision)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: reqRow, error: rErr } = await admin
      .from("daily_limit_increase_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (rErr || !reqRow) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reqRow.status !== "pending") {
      return new Response(JSON.stringify({ error: "Request already reviewed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const expiresAt = decision === "approve" && validity_days > 0
      ? new Date(now.getTime() + validity_days * 86400000).toISOString()
      : null;

    await admin
      .from("daily_limit_increase_requests")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        admin_notes,
        reviewed_by: user.id,
        reviewed_at: now.toISOString(),
        expires_at: decision === "approve" ? expiresAt : null,
      })
      .eq("id", requestId);

    let userPhone: string | null = null;
    const { data: profile } = await admin
      .from("profiles").select("phone, full_name").eq("id", reqRow.user_id).maybeSingle();
    userPhone = profile?.phone ?? null;

    if (decision === "approve") {
      await admin.from("profiles").update({
        custom_daily_limit: reqRow.requested_limit,
        custom_daily_limit_expires_at: expiresAt,
      }).eq("id", reqRow.user_id);
    }

    await admin.from("notifications").insert({
      user_id: reqRow.user_id,
      title: `Daily Limit ${decision === "approve" ? "Approved" : "Rejected"}`,
      message: decision === "approve"
        ? `Your daily payout limit is now KES ${Number(reqRow.requested_limit).toLocaleString()}${expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString()}` : ""}.`
        : `Your limit increase request was rejected.${admin_notes ? ` Reason: ${admin_notes}` : ""}`,
      type: decision === "approve" ? "success" : "warning",
    });

    if (userPhone) {
      const msg = decision === "approve"
        ? `PAMOJA NOVA: Your daily payout limit is now KES ${Number(reqRow.requested_limit).toLocaleString()}.`
        : `PAMOJA NOVA: Your limit increase request was rejected.${admin_notes ? ` ${admin_notes}` : ""}`;
      await sendSMS(userPhone, msg);
    }

    // Audit log
    await admin.rpc("log_admin_action", {
      _action_key: `daily_limit.${decision}`,
      _target_type: "daily_limit_request",
      _target_id: requestId,
      _metadata: { requested_limit: reqRow.requested_limit, validity_days, admin_notes },
      _ip_address: null,
      _user_agent: req.headers.get("user-agent") ?? null,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
