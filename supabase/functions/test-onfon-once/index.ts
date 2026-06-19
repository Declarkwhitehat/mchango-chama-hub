import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ONFON_API_KEY = Deno.env.get("ONFON_API_KEY");
const ONFON_CLIENT_ID = Deno.env.get("ONFON_CLIENT_ID");
const ONFON_SENDER_ID = Deno.env.get("ONFON_SENDER_ID");
const ONFON_ACCESS_KEY = Deno.env.get("ONFON_ACCESS_KEY") || ONFON_CLIENT_ID;
const corsHeaders = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const res = await fetch("https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS", {
    method: "POST",
    headers: { "Content-Type":"application/json", AccessKey: ONFON_ACCESS_KEY!, Accesskey: ONFON_ACCESS_KEY! },
    body: JSON.stringify({
      SenderId: ONFON_SENDER_ID, IsUnicode:false, IsFlash:false,
      MessageParameters: [{ Number:"254707874790", Text:"Test from Pamoja Nova admin SMS tool. The per-user SMS feature is live." }],
      ApiKey: ONFON_API_KEY, ClientId: ONFON_CLIENT_ID,
    }),
  });
  const text = await res.text();
  return new Response(JSON.stringify({ status: res.status, body: text }), { headers: { ...corsHeaders, "Content-Type":"application/json" } });
});
