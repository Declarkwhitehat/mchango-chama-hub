import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ONFON_API_KEY = Deno.env.get("ONFON_API_KEY");
const ONFON_CLIENT_ID = Deno.env.get("ONFON_CLIENT_ID");
const ONFON_SENDER_ID = Deno.env.get("ONFON_SENDER_ID");
const ONFON_ACCESS_KEY = Deno.env.get("ONFON_ACCESS_KEY") || ONFON_CLIENT_ID;

const HOUR = 3600 * 1000;
const FINAL_WINDOW_MS = 6 * HOUR; // "ends today" when 6h or less remain

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

async function sendSms(phone: string, message: string): Promise<boolean> {
  if (!ONFON_API_KEY || !ONFON_CLIENT_ID || !ONFON_SENDER_ID || !ONFON_ACCESS_KEY) {
    console.warn("[mchango-expiry-reminders] SMS creds missing");
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
    console.error("[mchango-expiry-reminders] sms error", (e as Error).message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = Date.now();
  const upperBound = new Date(now + 24 * HOUR).toISOString();
  const nowIso = new Date(now).toISOString();

  const stats = { scanned: 0, sms24: 0, smsFinal: 0, push: 0, errors: 0 };

  try {
    const { data: campaigns, error } = await admin
      .from("mchango")
      .select("id, title, slug, end_date, created_by, status, is_public")
      .eq("status", "active")
      .eq("is_public", true)
      .not("end_date", "is", null)
      .gte("end_date", nowIso)
      .lte("end_date", upperBound);

    if (error) throw error;

    for (const c of campaigns || []) {
      stats.scanned++;
      const endMs = new Date(c.end_date as string).getTime();
      const remaining = endMs - now;
      if (remaining <= 0) continue;

      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", c.created_by)
        .maybeSingle();

      const name = (profile?.full_name || "there").split(" ")[0];
      const phone = normalizePhone(profile?.phone);
      const link = `https://pamojanova.com/mchango/${c.slug}`;

      // ---------- 24h reminder ----------
      const { error: dup24 } = await admin
        .from("mchango_expiry_reminders_sent")
        .insert({ campaign_id: c.id, reminder_type: "24h" });

      if (!dup24) {
        const msg = `Hi ${name}, your campaign "${c.title}" ends in less than 24 hours. Share the link to boost donations: ${link} - PAMOJA NOVA`;
        if (phone) {
          const ok = await sendSms(phone, msg);
          if (ok) stats.sms24++;
        }
        await admin.from("notifications").insert({
          user_id: c.created_by,
          title: "Campaign ends in less than 24 hours",
          message: `Your campaign "${c.title}" ends soon. Share the link to get more donations.`,
          type: "warning",
          category: "mchango",
          related_entity_id: c.id,
          related_entity_type: "mchango",
        });
        stats.push++;
      }

      // ---------- Final "ends today" reminder ----------
      if (remaining <= FINAL_WINDOW_MS) {
        const { error: dupF } = await admin
          .from("mchango_expiry_reminders_sent")
          .insert({ campaign_id: c.id, reminder_type: "final" });

        if (!dupF) {
          const msg = `Hi ${name}, your campaign "${c.title}" ends today. You can withdraw the funds once it closes. - PAMOJA NOVA`;
          if (phone) {
            const ok = await sendSms(phone, msg);
            if (ok) stats.smsFinal++;
          }
          await admin.from("notifications").insert({
            user_id: c.created_by,
            title: "Your campaign ends today",
            message: `"${c.title}" ends today. You can withdraw funds once it closes.`,
            type: "warning",
            category: "mchango",
            related_entity_id: c.id,
            related_entity_type: "mchango",
          });
          stats.push++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[mchango-expiry-reminders] fatal", (e as Error).message);
    stats.errors++;
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
