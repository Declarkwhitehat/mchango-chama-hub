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
const ONFON_ACCESS_KEY = Deno.env.get("ONFON_ACCESS_KEY") || ONFON_CLIENT_ID;

const sanitize = (raw: string): string => {
  if (!raw) return "";
  let t = raw.normalize("NFKC");
  t = t.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  t = t.replace(/[\u{2600}-\u{27BF}]/gu, "");
  t = t.replace(/[\u200D\uFE0F\u20E3]/g, "");
  t = t
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ");
  t = t.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  return t;
};

const normalizePhone = (raw: string | null): string | null => {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("2540")) p = "254" + p.slice(4);
  if (/^0\d{9}$/.test(p)) p = "254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = "254" + p;
  if (!/^254[17]\d{8}$/.test(p)) return null;
  return p;
};

const isOnfonSuccessCode = (code: unknown) => code === 0 || code === "0" || code === "000";
const providerMessage = (v: unknown) => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : undefined;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden - admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.user_id;
    const rawPhone: string | undefined = body.phone;
    const message = sanitize(String(body.message || ""));

    if (!message || message.length < 3) {
      return new Response(JSON.stringify({ error: "Message is too short. Please write at least 3 characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message.length > 480) {
      return new Response(JSON.stringify({ error: "Message is too long. Keep it under 480 characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let phoneSource = rawPhone || null;
    if (!phoneSource && targetUserId) {
      const { data: prof, error: pErr } = await admin
        .from("profiles").select("phone").eq("id", targetUserId).maybeSingle();
      if (pErr) {
        return new Response(JSON.stringify({ error: "Could not look up user phone" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      phoneSource = prof?.phone || null;
    }

    const normalized = normalizePhone(phoneSource);
    if (!normalized) {
      return new Response(JSON.stringify({ error: "User has no valid Kenyan (254...) phone number on file" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ONFON_API_KEY || !ONFON_CLIENT_ID || !ONFON_SENDER_ID || !ONFON_ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "SMS provider credentials are not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessKey: ONFON_ACCESS_KEY, Accesskey: ONFON_ACCESS_KEY },
      body: JSON.stringify({
        SenderId: ONFON_SENDER_ID,
        IsUnicode: false,
        IsFlash: false,
        MessageParameters: [{ Number: normalized, Text: message }],
        ApiKey: ONFON_API_KEY,
        ClientId: ONFON_CLIENT_ID,
      }),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }

    const data = Array.isArray(json?.Data) ? json.Data : [];
    const first = data[0];
    const reqOk = res.ok && isOnfonSuccessCode(json?.ErrorCode);
    const msgOk = !first || first.MessageErrorCode === undefined || first.MessageErrorCode === null ||
      first.MessageErrorCode === "" || isOnfonSuccessCode(first.MessageErrorCode);

    // Log to admin_sms_broadcasts for audit (single-recipient entry)
    await admin.from("admin_sms_broadcasts").insert({
      admin_user_id: userData.user.id,
      segment: "single_user",
      message,
      recipient_count: 1,
      sent_count: reqOk && msgOk ? 1 : 0,
      failed_count: reqOk && msgOk ? 0 : 1,
      status: reqOk && msgOk ? "completed" : "failed",
      error: reqOk && msgOk ? null : (providerMessage(first?.MessageErrorDescription) || providerMessage(json?.ErrorDescription) || `HTTP ${res.status}`),
      completed_at: new Date().toISOString(),
    });

    if (!reqOk || !msgOk) {
      const errMsg = providerMessage(first?.MessageErrorDescription)
        || providerMessage(json?.ErrorDescription)
        || `Onfon rejected the message (HTTP ${res.status})`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      recipient: normalized,
      message_id: first?.MessageId || null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Failed to send SMS" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
