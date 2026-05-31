import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Manual registration-fee reminder.
 * Body: { member_id: string }
 * Caller must be chairman/secretary/treasurer of the member's welfare (or platform admin).
 * Sends in-app notification + push + SMS. Rate-limited to 1 reminder / member / hour.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { member_id } = await req.json();
    if (!member_id) {
      return new Response(JSON.stringify({ error: "member_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load target member
    const { data: member, error: mErr } = await supabaseAdmin
      .from("welfare_members")
      .select(
        "id, welfare_id, user_id, member_code, registration_fee_due, registration_fee_paid, registration_status, registration_deadline, registration_last_reminder_at, welfares(name), profiles:user_id(phone, full_name)"
      )
      .eq("id", member_id)
      .maybeSingle();

    if (mErr || !member) {
      return new Response(JSON.stringify({ error: "Member not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["pending", "partial"].includes(member.registration_status)) {
      return new Response(
        JSON.stringify({ error: "Member is not in pending registration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorise caller: must be executive of same welfare OR admin
    const [{ data: callerMember }, { data: isAdminRow }] = await Promise.all([
      supabaseAdmin
        .from("welfare_members")
        .select("role, status")
        .eq("welfare_id", member.welfare_id)
        .eq("user_id", callerId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

    const isExec =
      callerMember &&
      callerMember.status === "active" &&
      ["chairman", "secretary", "treasurer"].includes(callerMember.role);
    const isAdmin = !!isAdminRow;

    if (!isExec && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Throttle: max 1 manual reminder per hour per member
    if (member.registration_last_reminder_at) {
      const last = new Date(member.registration_last_reminder_at).getTime();
      if (Date.now() - last < 60 * 60 * 1000) {
        const mins = Math.ceil((60 * 60 * 1000 - (Date.now() - last)) / 60000);
        return new Response(
          JSON.stringify({ error: `Please wait ${mins} more minute(s) before reminding again.` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const remaining = Math.max(
      Number(member.registration_fee_due || 0) - Number(member.registration_fee_paid || 0),
      0
    );
    const welfareName = (member as any).welfares?.name || "your welfare group";
    const deadlineStr = member.registration_deadline
      ? new Date(member.registration_deadline).toLocaleDateString("en-GB")
      : "soon";
    const inApp = `Reminder: Pay KES ${remaining.toLocaleString()} via Paybill 4015351, Account ${member.member_code}, before ${deadlineStr} to activate membership in "${welfareName}".`;

    await supabaseAdmin.from("notifications").insert({
      user_id: member.user_id,
      title: "Welfare registration reminder",
      message: inApp,
      type: "warning",
      category: "welfare",
      related_entity_type: "welfare",
      related_entity_id: member.welfare_id,
    });

    supabaseAdmin.functions
      .invoke("send-push-notification", {
        body: { user_id: member.user_id, title: "Welfare registration reminder", body: inApp },
      })
      .catch(() => {});

    const phone = (member as any).profiles?.phone;
    if (phone) {
      const sms = `${welfareName}: Pay KES ${remaining.toLocaleString()} via Paybill 4015351, Acc ${member.member_code}, by ${deadlineStr} to activate membership.`;
      await supabaseAdmin.functions
        .invoke("send-transactional-sms", {
          body: { phone, message: sms, eventType: "welfare_registration_reminder" },
        })
        .catch((e: unknown) => console.warn("SMS failed:", e));
    }

    await supabaseAdmin
      .from("welfare_members")
      .update({ registration_last_reminder_at: new Date().toISOString() })
      .eq("id", member.id);

    return new Response(JSON.stringify({ success: true, remaining }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error)?.message || "Unknown error";
    console.error("welfare-registration-remind error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
