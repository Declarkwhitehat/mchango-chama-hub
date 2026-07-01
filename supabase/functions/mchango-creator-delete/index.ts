import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const norm = (s: string) => (s || "").trim().toLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Not signed in. Please log in again." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mchangoId: string | undefined = body.mchango_id;
    const confirmTitle: string = String(body.confirm_title || "");

    if (!mchangoId) {
      return new Response(JSON.stringify({ error: "Missing campaign id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: mch, error: mErr } = await admin
      .from("mchango")
      .select("id, title, created_by, end_date, current_amount, available_balance")
      .eq("id", mchangoId)
      .maybeSingle();

    if (mErr || !mch) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mch.created_by !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Only the campaign creator can delete this campaign" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const end = mch.end_date ? new Date(mch.end_date).getTime() : 0;
    if (!end || end > Date.now()) {
      return new Response(JSON.stringify({
        error: "You can only delete this campaign after it has ended (0 days left)."
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (norm(confirmTitle) !== norm(mch.title)) {
      return new Response(JSON.stringify({
        error: "Confirmation text does not match the campaign title."
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Block if any pending withdrawal exists — funds must not be in flight.
    const { data: pending } = await admin
      .from("withdrawals")
      .select("id, status")
      .eq("mchango_id", mchangoId)
      .in("status", ["pending", "processing", "approved"]);
    if (pending && pending.length > 0) {
      return new Response(JSON.stringify({
        error: "Cannot delete: a withdrawal is still pending or being processed for this campaign."
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sweep any remaining balance to company revenue (atomic RPC).
    let sweptAmount = 0;
    let ledgerId: string | null = null;
    const available = Number(mch.available_balance ?? mch.current_amount ?? 0);
    if (available > 0) {
      const { data: sweepRes, error: sweepErr } = await admin.rpc("sweep_mchango_to_revenue", {
        p_mchango_id: mchangoId,
        p_reason: "creator_deleted_expired_campaign",
        p_actor: userData.user.id,
      });
      if (sweepErr) {
        console.error("[mchango-creator-delete] sweep failed:", sweepErr);
        return new Response(JSON.stringify({ error: "Failed to secure remaining funds. Deletion aborted." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sweptAmount = Number((sweepRes as any)?.swept_amount || 0);
      ledgerId = (sweepRes as any)?.ledger_id || null;
    } else {
      // Log a zero-amount ledger entry so admins still see the deletion event.
      const { data: prof } = await admin
        .from("profiles").select("full_name, phone, email").eq("id", mch.created_by).maybeSingle();
      const { data: ins } = await admin.from("abandoned_funds_ledger").insert({
        source_type: "mchango",
        source_id: mch.id,
        source_name: mch.title,
        owner_user_id: mch.created_by,
        owner_name: prof?.full_name,
        owner_phone: prof?.phone,
        owner_email: prof?.email,
        gross_amount: 0, commission_taken: 0, net_swept_to_revenue: 0,
        reason: "creator_deleted_expired_campaign",
        metadata: { note: "No remaining balance at deletion." },
        swept_by: userData.user.id,
      }).select("id").maybeSingle();
      ledgerId = ins?.id || null;
    }

    // Cascade delete related rows, then the campaign row itself.
    await admin.from("mchango_donations").delete().eq("mchango_id", mchangoId);
    await admin.from("transactions").delete().eq("mchango_id", mchangoId);
    await admin.from("payouts").delete().eq("mchango_id", mchangoId);
    await admin.from("withdrawals").delete().eq("mchango_id", mchangoId);
    const { error: delErr } = await admin.from("mchango").delete().eq("id", mchangoId);
    if (delErr) {
      console.error("[mchango-creator-delete] final delete error:", delErr);
      return new Response(JSON.stringify({ error: "Failed to delete campaign record." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit trail
    try {
      await admin.from("admin_action_log").insert({
        actor_user_id: userData.user.id,
        actor_email: userData.user.email,
        action_key: "mchango.creator_delete_expired",
        target_type: "mchango",
        target_id: mchangoId,
        metadata: { title: mch.title, swept_amount: sweptAmount, ledger_id: ledgerId },
      });
    } catch (_) { /* best effort */ }

    return new Response(JSON.stringify({
      success: true,
      swept_amount: sweptAmount,
      ledger_id: ledgerId,
      title: mch.title,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[mchango-creator-delete] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Failed to delete campaign" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
