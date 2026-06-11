import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

// Push reminder window: send when 9.5h–10.5h remain until deadline
// SMS reminder window: send when 5.5h–6.5h remain until deadline
const PUSH_WINDOW_MIN_MS = 9.5 * 60 * 60 * 1000;
const PUSH_WINDOW_MAX_MS = 10.5 * 60 * 60 * 1000;
const SMS_WINDOW_MIN_MS = 5.5 * 60 * 60 * 1000;
const SMS_WINDOW_MAX_MS = 6.5 * 60 * 60 * 1000;

function formatEatDeadline(input: string): string {
  return new Date(input).toLocaleTimeString("en-KE", {
    timeZone: "Africa/Nairobi",
    hour: "numeric",
    minute: "2-digit",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const now = Date.now();
  const stats = { chamasScanned: 0, pushSent: 0, smsSent: 0, errors: 0 };

  try {
    // Find first cycles (cycle_number = 1) for active chamas, where deadline is still ahead
    const { data: cycles, error: cycErr } = await supabase
      .from("contribution_cycles")
      .select(`
        id, end_date, chama_id, cycle_number,
        chama:chama!contribution_cycles_chama_id_fkey(id, name, status, contribution_amount)
      `)
      .eq("cycle_number", 1)
      .eq("is_complete", false)
      .gte("end_date", new Date(now).toISOString());

    if (cycErr) throw cycErr;

    for (const cycle of cycles || []) {
      const chama: any = (cycle as any).chama;
      if (!chama || chama.status !== "active") continue;
      stats.chamasScanned++;

      const deadlineMs = new Date(cycle.end_date).getTime();
      const remaining = deadlineMs - now;
      if (remaining <= 0) continue;
      const deadlineText = formatEatDeadline(cycle.end_date);

      const inPushWindow = remaining >= PUSH_WINDOW_MIN_MS && remaining <= PUSH_WINDOW_MAX_MS;
      const inSmsWindow = remaining >= SMS_WINDOW_MIN_MS && remaining <= SMS_WINDOW_MAX_MS;
      if (!inPushWindow && !inSmsWindow) continue;

      // Get unpaid approved members for this cycle
      const { data: payments } = await supabase
        .from("member_cycle_payments")
        .select(`
          member_id, fully_paid, is_paid,
          member:chama_members!member_cycle_payments_member_id_fkey(
            id, user_id, status, approval_status,
            profiles:profiles!chama_members_user_id_fkey(full_name, phone)
          )
        `)
        .eq("cycle_id", cycle.id);

      const unpaid = (payments || []).filter((p: any) => {
        const m = p.member;
        return m && m.approval_status === "approved" && m.status === "active"
          && !p.fully_paid && !p.is_paid;
      });

      for (const p of unpaid) {
        const m: any = (p as any).member;
        const memberId = m.id;
        const userId = m.user_id;
        const fullName = m.profiles?.full_name || "Member";
        const phone = m.profiles?.phone || null;

        // ---------- PUSH (10h before) ----------
        if (inPushWindow) {
          const { error: dupErr } = await supabase
            .from("chama_grace_reminders_sent")
            .insert({ member_id: memberId, cycle_id: cycle.id, reminder_type: "push_10h" });

          if (!dupErr) {
            // notifications insert triggers push via DB trigger
            const { error: notifErr } = await supabase.from("notifications").insert({
              user_id: userId,
              title: `Pay your first contribution today`,
              message: `Your first contribution of KES ${Number(chama.contribution_amount).toLocaleString()} for "${chama.name}" is due by ${deadlineText} today. Tap to pay now.`,
              type: "warning",
              category: "chama_payment",
              related_entity_id: chama.id,
              related_entity_type: "chama",
            });
            if (notifErr) {
              stats.errors++;
              console.error("notif insert failed", notifErr);
            } else {
              stats.pushSent++;
            }
          }
        }

        // ---------- SMS (6h before) ----------
        if (inSmsWindow && phone) {
          const { error: dupErr } = await supabase
            .from("chama_grace_reminders_sent")
            .insert({ member_id: memberId, cycle_id: cycle.id, reminder_type: "sms_6h" });

          if (!dupErr) {
            const message = `${fullName.split(" ")[0]}, your KES ${Number(chama.contribution_amount).toLocaleString()} for "${chama.name}" is due by ${deadlineText} today. Pay now or you will be removed.`.slice(0, 160);

            try {
              const { error: smsErr } = await supabase.functions.invoke("send-transactional-sms", {
                body: { phone, message, eventType: "chama_grace_warning" },
              });
              if (smsErr) {
                stats.errors++;
                console.error("sms invoke failed", smsErr);
              } else {
                stats.smsSent++;
              }
            } catch (e) {
              stats.errors++;
              console.error("sms exception", (e as Error).message);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, ...stats, ranAt: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("chama-grace-reminders error", error);
    return new Response(JSON.stringify({ error: (error as Error).message, ...stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
