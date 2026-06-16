import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ONFON_API_KEY = Deno.env.get("ONFON_API_KEY");
const ONFON_CLIENT_ID = Deno.env.get("ONFON_CLIENT_ID");
const ONFON_SENDER_ID = Deno.env.get("ONFON_SENDER_ID");
const ONFON_ACCESS_KEY = Deno.env.get("ONFON_ACCESS_KEY") || ONFON_CLIENT_ID;

interface OnfonMessageResult {
  MessageErrorCode?: string | number | null;
  MessageErrorDescription?: string | null;
  MessageId?: string | null;
}

interface OnfonSMSResponse {
  ErrorCode?: string | number | null;
  ErrorDescription?: string | null;
  Data?: OnfonMessageResult[];
}

type SendBatchResult = { sent: number; failed: number; error?: string };

type Segment =
  | "all_users"
  | "kyc_approved"
  | "kyc_missing"
  | "chama_creators"
  | "chama_members"
  | "welfare_creators"
  | "welfare_members"
  | "mchango_creators"
  | "mchango_donors"
  | "top_trust";

const TAGLINE = "sisi tuko pamoja, je wewe?";

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

async function fetchRecipientPhones(
  admin: any,
  segment: Segment,
): Promise<string[]> {
  let ids: string[] | null = null;

  if (segment === "all_users") {
    const { data, error } = await admin.from("profiles").select("phone").not("phone", "is", null);
    if (error) throw error;
    return uniqPhones(data?.map((r: any) => r.phone));
  }
  if (segment === "kyc_approved") {
    const { data, error } = await admin
      .from("profiles")
      .select("phone")
      .eq("kyc_status", "approved")
      .not("phone", "is", null);
    if (error) throw error;
    return uniqPhones(data?.map((r: any) => r.phone));
  }
  if (segment === "kyc_missing") {
    const { data, error } = await admin
      .from("profiles")
      .select("phone, kyc_status")
      .not("phone", "is", null);
    if (error) throw error;
    return uniqPhones(
      (data || [])
        .filter((r: any) => !r.kyc_status || ["pending", "rejected", null].includes(r.kyc_status))
        .map((r: any) => r.phone),
    );
  }
  if (segment === "chama_creators") {
    const { data, error } = await admin.from("chama").select("created_by");
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.created_by));
  } else if (segment === "chama_members") {
    const { data, error } = await admin
      .from("chama_members")
      .select("user_id")
      .eq("approval_status", "approved")
      .neq("status", "removed");
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.user_id));
  } else if (segment === "welfare_creators") {
    const { data, error } = await admin.from("welfares").select("created_by");
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.created_by));
  } else if (segment === "welfare_members") {
    const { data, error } = await admin
      .from("welfare_members")
      .select("user_id")
      .eq("status", "active");
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.user_id));
  } else if (segment === "mchango_creators") {
    const { data, error } = await admin.from("mchango").select("created_by");
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.created_by));
  } else if (segment === "mchango_donors") {
    const { data, error } = await admin
      .from("mchango_donations")
      .select("user_id")
      .eq("payment_status", "completed")
      .not("user_id", "is", null);
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.user_id));
  } else if (segment === "top_trust") {
    const { data, error } = await admin
      .from("member_trust_scores")
      .select("user_id, trust_score")
      .gte("trust_score", 80);
    if (error) throw error;
    ids = uniqIds(data?.map((r: any) => r.user_id));
  }

  if (!ids || ids.length === 0) return [];
  // Fetch phones in batches
  const phones: string[] = [];
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("profiles")
      .select("phone")
      .in("id", slice)
      .not("phone", "is", null);
    if (error) throw error;
    for (const r of data || []) phones.push((r as any).phone);
  }
  return uniqPhones(phones);
}

function uniqIds(arr: (string | null | undefined)[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const v of arr || []) if (v) set.add(v);
  return Array.from(set);
}
function uniqPhones(arr: (string | null | undefined)[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const v of arr || []) {
    const n = normalizePhone(v || "");
    if (n) set.add(n);
  }
  return Array.from(set);
}

const isOnfonSuccessCode = (code: unknown): boolean => code === 0 || code === "0" || code === "000";

const providerMessage = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== "null" ? trimmed : undefined;
};

async function sendBatch(phones: string[], message: string): Promise<SendBatchResult> {
  try {
    if (!ONFON_API_KEY || !ONFON_CLIENT_ID || !ONFON_SENDER_ID || !ONFON_ACCESS_KEY) {
      return { sent: 0, failed: phones.length, error: "SMS provider credentials are not configured" };
    }

    const numbers = phones.map((p) => normalizePhone(p)).filter((p): p is string => !!p);
    if (!numbers.length) return { sent: 0, failed: phones.length, error: "No valid 254 phone numbers found" };

    const res = await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessKey: ONFON_ACCESS_KEY, Accesskey: ONFON_ACCESS_KEY },
      body: JSON.stringify({
        SenderId: ONFON_SENDER_ID,
        IsUnicode: false,
        IsFlash: false,
        MessageParameters: [{ Number: numbers.join(","), Text: message }],
        ApiKey: ONFON_API_KEY,
        ClientId: ONFON_CLIENT_ID,
      }),
    });
    const raw = await res.text();
    let json: OnfonSMSResponse | null = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (_error) {
      json = null;
    }

    const data = Array.isArray(json?.Data) ? json.Data : [];
    const requestAccepted = res.ok && isOnfonSuccessCode(json?.ErrorCode);
    if (requestAccepted) {
      if (data.length <= 1) {
        const first = data[0];
        const firstAccepted = !first ||
          first.MessageErrorCode === undefined ||
          first.MessageErrorCode === null ||
          first.MessageErrorCode === "" ||
          isOnfonSuccessCode(first.MessageErrorCode);
        return firstAccepted
          ? { sent: numbers.length, failed: 0 }
          : { sent: 0, failed: numbers.length, error: providerMessage(first.MessageErrorDescription) || "Onfon rejected the SMS numbers" };
      }

      const accepted = data.filter((item) => (
        item.MessageErrorCode === undefined ||
        item.MessageErrorCode === null ||
        item.MessageErrorCode === "" ||
        isOnfonSuccessCode(item.MessageErrorCode)
      )).length;
      const rejected = Math.max(numbers.length - accepted, 0);
      return {
        sent: accepted,
        failed: rejected,
        error: rejected > 0
          ? data.map((item) => providerMessage(item.MessageErrorDescription)).find(Boolean) || "Some numbers were rejected by Onfon"
          : undefined,
      };
    }

    const error =
      data.map((item) => providerMessage(item.MessageErrorDescription)).find(Boolean) ||
      providerMessage(json?.ErrorDescription) ||
      raw ||
      `Onfon rejected the SMS request with HTTP ${res.status}`;
    console.error("Onfon broadcast failed", { status: res.status, error, numbersCount: numbers.length });
    return { sent: 0, failed: numbers.length, error };
  } catch (e) {
    const error = (e as Error).message || "Unable to reach Onfon SMS service";
    console.error("Onfon broadcast error", error);
    return { sent: 0, failed: phones.length, error };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const segment = body.segment as Segment;
    const message = sanitize(String(body.message || ""));
    const preview = !!body.preview;
    const appendTagline = body.appendTagline !== false;

    const VALID: Segment[] = [
      "all_users",
      "kyc_approved",
      "kyc_missing",
      "chama_creators",
      "chama_members",
      "welfare_creators",
      "welfare_members",
      "mchango_creators",
      "mchango_donors",
      "top_trust",
    ];
    if (!VALID.includes(segment)) {
      return new Response(JSON.stringify({ error: "Invalid segment" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!preview && (!message || message.length < 3)) {
      return new Response(JSON.stringify({ error: "Message too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!preview && (!ONFON_API_KEY || !ONFON_CLIENT_ID || !ONFON_SENDER_ID)) {
      return new Response(JSON.stringify({ error: "SMS provider credentials are not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phones = await fetchRecipientPhones(admin, segment);

    if (preview) {
      return new Response(JSON.stringify({ success: true, recipient_count: phones.length }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phones.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients with valid 254 phone numbers found for this segment", recipient_count: 0 }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalMessage = appendTagline && !message.toLowerCase().includes("sisi tuko pamoja")
      ? `${message}\n${TAGLINE}`
      : message;

    const { data: logRow, error: logErr } = await admin
      .from("admin_sms_broadcasts")
      .insert({
        admin_user_id: userData.user.id,
        segment,
        message: finalMessage,
        recipient_count: phones.length,
        status: "sending",
      })
      .select("id")
      .single();
    if (logErr) console.error("log insert err", logErr);

    let sent = 0;
    let failed = 0;
    const errors = new Set<string>();
    // Onfon handles bulk requests reliably in packets of 20 numbers.
    const BATCH = 20;
    for (let i = 0; i < phones.length; i += BATCH) {
      const slice = phones.slice(i, i + BATCH);
      const result = await sendBatch(slice, finalMessage);
      sent += result.sent;
      failed += result.failed;
      if (result.error) errors.add(result.error);
    }

    if (logRow?.id) {
      await admin
        .from("admin_sms_broadcasts")
        .update({
          sent_count: sent,
          failed_count: failed,
          status: failed === 0 ? "completed" : sent > 0 ? "partial" : "failed",
          error: Array.from(errors)[0] || null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logRow.id);
    }

    if (sent === 0 && failed > 0) {
      return new Response(JSON.stringify({
        error: Array.from(errors)[0] || "Onfon rejected all SMS messages",
        recipient_count: phones.length,
        sent,
        failed,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      recipient_count: phones.length,
      sent,
      failed,
      warning: failed > 0 ? Array.from(errors)[0] || "Some messages failed" : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-sms-broadcast error", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
