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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const requested_limit = Number(body?.requested_limit);
    const reason = String(body?.reason ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const otp = String(body?.otp ?? "").trim();

    if (!Number.isFinite(requested_limit) || requested_limit < 150000 || requested_limit > 500000) {
      return new Response(JSON.stringify({ error: "Requested limit must be between KES 150,000 and 500,000" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reason.length < 20 || reason.length > 500) {
      return new Response(JSON.stringify({ error: "Reason must be 20-500 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone number is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^\d{6}$/.test(otp)) {
      return new Response(JSON.stringify({ error: "OTP must be 6 digits" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Prevent duplicate pending
    const { data: existing } = await admin
      .from("daily_limit_increase_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "You already have a pending request under review" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify OTP
    const { data: otpRecords } = await admin
      .from("otp_verifications")
      .select("*")
      .eq("phone", phone)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    const otpRecord = otpRecords?.[0];
    if (!otpRecord || otpRecord.otp !== otp) {
      if (otpRecord) {
        await admin.from("otp_verifications").update({ attempts: (otpRecord.attempts ?? 0) + 1 }).eq("id", otpRecord.id);
      }
      return new Response(JSON.stringify({ error: "Invalid or expired OTP" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await admin.from("otp_verifications").update({ verified: true, verified_at: new Date().toISOString() }).eq("id", otpRecord.id);

    const { data: inserted, error: insertErr } = await admin
      .from("daily_limit_increase_requests")
      .insert({
        user_id: user.id,
        current_limit: 150000,
        requested_limit,
        reason,
        status: "pending",
        otp_verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify admins in-app
    const { data: admins } = await admin.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
    if (admins?.length) {
      const rows = admins.map((a: any) => ({
        user_id: a.user_id,
        title: "Daily Limit Increase Request",
        message: `A user requested increase to KES ${requested_limit.toLocaleString()}. Review in admin panel.`,
        type: "admin_action_required",
      }));
      await admin.from("notifications").insert(rows);
    }

    return new Response(JSON.stringify({ success: true, request: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
