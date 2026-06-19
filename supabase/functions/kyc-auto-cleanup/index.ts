import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ONFON_API_KEY = Deno.env.get("ONFON_API_KEY");
const ONFON_CLIENT_ID = Deno.env.get("ONFON_CLIENT_ID");
const ONFON_SENDER_ID = Deno.env.get("ONFON_SENDER_ID");
const ONFON_ACCESS_KEY = Deno.env.get("ONFON_ACCESS_KEY") || ONFON_CLIENT_ID;

const HOURS = 3600 * 1000;
const REMINDER_BUCKETS = [1, 2, 3, 4]; // 72h, 144h, 216h, 288h
const DELETE_AFTER_HOURS = 336; // 14 days

const sanitize = (raw: string): string => {
  if (!raw) return "";
  let t = raw.normalize("NFKC");
  t = t.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  t = t.replace(/[\u{2600}-\u{27BF}]/gu, "");
  t = t.replace(/[\u200D\uFE0F\u20E3]/g, "");
  t = t.replace(/[ \t]+/g, " ").trim();
  return t;
};

const normalizePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("2540")) p = "254" + p.slice(4);
  if (/^0\d{9}$/.test(p)) p = "254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = "254" + p;
  if (!/^254[17]\d{8}$/.test(p)) return null;
  return p;
};

async function sendSms(phone: string, message: string) {
  if (!ONFON_API_KEY || !ONFON_CLIENT_ID || !ONFON_SENDER_ID || !ONFON_ACCESS_KEY) {
    console.warn("[kyc-auto-cleanup] SMS creds missing - skipping send");
    return false;
  }
  try {
    const res = await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessKey: ONFON_ACCESS_KEY, Accesskey: ONFON_ACCESS_KEY },
      body: JSON.stringify({
        SenderId: ONFON_SENDER_ID,
        IsUnicode: false,
        IsFlash: false,
        MessageParameters: [{ Number: phone, Text: sanitize(message) }],
        ApiKey: ONFON_API_KEY,
        ClientId: ONFON_CLIENT_ID,
      }),
    });
    await res.text();
    return res.ok;
  } catch (e) {
    console.error("[kyc-auto-cleanup] sms error", (e as Error).message);
    return false;
  }
}

async function isSafeToDelete(admin: any, userId: string): Promise<{ safe: boolean; reason?: string }> {
  // Admin roles
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if ((roles || []).some((r: any) => r.role === "admin" || r.role === "super_admin")) {
    return { safe: false, reason: "admin_role" };
  }
  // Pending withdrawals
  const { data: w } = await admin
    .from("withdrawals").select("id").eq("requested_by", userId)
    .in("status", ["pending", "approved", "processing", "pending_retry"]).limit(1);
  if (w && w.length) return { safe: false, reason: "pending_withdrawal" };
  // Manager of active/pending chama
  const { data: m } = await admin
    .from("chama_members")
    .select("chama_id, chama:chama_id(status)")
    .eq("user_id", userId).eq("is_manager", true)
    .eq("status", "active").eq("approval_status", "approved");
  if ((m || []).some((x: any) => x.chama && ["active", "pending"].includes(x.chama.status))) {
    return { safe: false, reason: "manages_chama" };
  }
  return { safe: true };
}

async function softDeleteUser(admin: any, userId: string) {
  await admin.from("profiles").update({
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
    deletion_reason: "kyc_not_verified_14d",
  }).eq("id", userId);

  await admin.from("chama_members").update({ status: "left" })
    .eq("user_id", userId).eq("is_manager", false)
    .in("status", ["active", "inactive"]);

  try {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  } catch (e) {
    console.warn("[kyc-auto-cleanup] ban failed", (e as Error).message);
  }

  try {
    await admin.from("audit_logs").insert({
      action: "AUTO_DELETE_KYC",
      table_name: "profiles",
      record_id: userId,
      user_id: userId,
      new_values: { reason: "kyc_not_verified_14d" },
    });
  } catch (_) { /* ignore */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = Date.now();

  const stats = { scanned: 0, reminders_sent: 0, deleted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch profiles not KYC-approved, not soft-deleted, older than 72h
    const cutoff = new Date(now - 72 * HOURS).toISOString();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name, phone, kyc_status, created_at, kyc_submitted_at, deleted_at")
      .neq("kyc_status", "approved")
      .is("deleted_at", null)
      .lte("created_at", cutoff)
      .limit(500);

    if (error) throw error;

    for (const p of profiles || []) {
      stats.scanned++;
      try {
        const created = new Date(p.created_at).getTime();
        const hoursSince = (now - created) / HOURS;
        const daysLeft = Math.max(0, Math.ceil((DELETE_AFTER_HOURS - hoursSince) / 24));
        const phone = normalizePhone(p.phone);
        const name = (p.full_name || "there").split(" ")[0];

        // DELETE branch — 14 days, pending review pauses clock
        if (hoursSince >= DELETE_AFTER_HOURS) {
          // If user submitted KYC and is awaiting review, pause until 14d after submission
          if (p.kyc_status === "pending" && p.kyc_submitted_at) {
            const submitted = new Date(p.kyc_submitted_at).getTime();
            if ((now - submitted) / HOURS < DELETE_AFTER_HOURS) {
              stats.skipped++;
              continue;
            }
          }
          const safety = await isSafeToDelete(admin, p.id);
          if (!safety.safe) {
            console.log(`[kyc-auto-cleanup] skip delete ${p.id} (${safety.reason})`);
            stats.skipped++;
            continue;
          }
          await softDeleteUser(admin, p.id);
          if (phone) {
            await sendSms(phone, `Your PAMOJA NOVA account was removed because KYC was not completed within 14 days. You can sign up again anytime at pamojanova.com`);
          }
          stats.deleted++;
          continue;
        }

        // REMINDER branch
        const bucket = Math.min(REMINDER_BUCKETS.length, Math.floor(hoursSince / 72));
        if (bucket < 1) continue;

        // Already sent?
        const { data: sent } = await admin
          .from("kyc_reminders_sent")
          .select("bucket").eq("user_id", p.id).eq("bucket", bucket).maybeSingle();
        if (sent) continue;

        const msg = `Hi ${name}, verify your KYC within ${daysLeft} day${daysLeft === 1 ? "" : "s"} or your PAMOJA NOVA account will be removed. Upload now: pamojanova.com/kyc-upload`;
        if (phone) await sendSms(phone, msg);

        // In-app notification (best-effort)
        try {
          await admin.from("notifications").insert({
            user_id: p.id,
            type: "kyc_reminder",
            title: "Verify your KYC",
            message: `You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to upload your KYC documents before your account is removed.`,
            link: "/kyc-upload",
          });
        } catch (_) { /* ignore */ }

        await admin.from("kyc_reminders_sent").insert({ user_id: p.id, bucket });
        stats.reminders_sent++;
      } catch (e) {
        stats.errors++;
        console.error(`[kyc-auto-cleanup] error for ${p.id}`, (e as Error).message);
      }
    }

    console.log("[kyc-auto-cleanup] done", stats);
    return new Response(JSON.stringify({ success: true, ...stats }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[kyc-auto-cleanup] fatal", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message, ...stats }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
