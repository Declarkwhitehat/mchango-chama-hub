// One-off admin SMS blaster gated purely by the privilege code.
// Used for ad-hoc targeted messages to a supplied phone list.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_PRIVILEGE_CODE = "D3E9C0L1A3R9K";
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
  return t.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
};

const normalizePhone = (raw: string): string | null => {
  let p = String(raw || "").replace(/\D/g, "");
  if (p.startsWith("2540")) p = "254" + p.slice(4);
  if (/^0\d{9}$/.test(p)) p = "254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = "254" + p;
  return /^254[17]\d{8}$/.test(p) ? p : null;
};

const isOk = (c: unknown) => c === 0 || c === "0" || c === "000";

async function sendBatch(numbers: string[], text: string) {
  const res = await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
    method: "POST",
    headers: { "Content-Type": "application/json", AccessKey: ONFON_ACCESS_KEY || "", Accesskey: ONFON_ACCESS_KEY || "" },
    body: JSON.stringify({
      SenderId: ONFON_SENDER_ID,
      IsUnicode: false,
      IsFlash: false,
      MessageParameters: [{ Number: numbers.join(","), Text: text }],
      ApiKey: ONFON_API_KEY,
      ClientId: ONFON_CLIENT_ID,
    }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
  const accepted = res.ok && isOk(json?.ErrorCode);
  return { accepted, count: numbers.length, raw, error: accepted ? null : (json?.ErrorDescription || raw) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    if (String(body.privilege_code || "") !== ADMIN_PRIVILEGE_CODE) {
      return new Response(JSON.stringify({ error: "Invalid privilege code" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const message = sanitize(String(body.message || ""));
    if (message.length < 3) {
      return new Response(JSON.stringify({ error: "Message too short" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const list: string[] = Array.isArray(body.phones) ? body.phones.map(String) : [];
    const numbers = Array.from(new Set(list.map(normalizePhone).filter((n): n is string => !!n)));
    if (numbers.length === 0) {
      return new Response(JSON.stringify({ error: "No valid phone numbers" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ONFON_API_KEY || !ONFON_CLIENT_ID || !ONFON_SENDER_ID) {
      return new Response(JSON.stringify({ error: "SMS provider not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0, failed = 0;
    const errors: string[] = [];
    const BATCH = 20;
    for (let i = 0; i < numbers.length; i += BATCH) {
      const slice = numbers.slice(i, i + BATCH);
      const r = await sendBatch(slice, message);
      if (r.accepted) sent += r.count; else { failed += r.count; if (r.error) errors.push(String(r.error)); }
    }
    return new Response(JSON.stringify({ success: true, total: numbers.length, sent, failed, errors }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
