// Compatibility wrapper around the get_admin_transactions RPC.
// The deployed native APK calls supabase.functions.invoke("admin-transactions",...)
// while newer web bundles call the RPC directly. This keeps older installs working.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use user-context client so auth.uid() inside the RPC resolves correctly.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let body: any = {};
    try { body = await req.json(); } catch { /* empty ok */ }
    const p_search = typeof body?.search === "string" ? body.search : "";
    const p_limit = Number.isFinite(Number(body?.limit)) ? Number(body.limit) : 200;

    const { data, error } = await userClient.rpc("get_admin_transactions", { p_search, p_limit });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data ?? { transactions: [], total: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-transactions error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
