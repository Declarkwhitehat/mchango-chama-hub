// index.ts — chama-crud edge function (Deno / Supabase Functions)
// Replace existing file with this content. Make sure the environment secret
// SUPABASE_SERVICE_ROLE_KEY is set for this function in Supabase Cloud.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
}

// CORS headers for browser calls
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create two clients:
// - publicClient: uses anon key (subject to RLS) — used for reading chama row
// - adminClient: uses service_role key (bypasses RLS) — used only to read chama_members safely
const publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // edge runtime: no fetch polyfill needed
  auth: { persistSession: false },
});
let adminClient: ReturnType<typeof createClient> | null = null;
if (SUPABASE_SERVICE_ROLE_KEY) {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
} else {
  console.warn("SUPABASE_SERVICE_ROLE_KEY not set — the function will attempt public queries only (may trigger RLS errors).");
}

async function handleGet(req: Request) {
  try {
    // Accept id in JSON body, or query string? we'll support both.
    let id: string | null = null;
    try {
      const j = await req.json().catch(() => null);
      if (j && (j.id || j.slug)) {
        id = j.id ?? j.slug;
      }
    } catch (e) {
      // ignore
    }

    // fallback to URL query param ?id=...
    if (!id) {
      const url = new URL(req.url);
      id = url.searchParams.get("id") || url.searchParams.get("slug");
    }

if (!id) {
      return new Response(JSON.stringify({ error: "Missing id or slug in request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // First try to fetch the chama row via public client.
    // We will not request nested chama_members here to avoid policies running on chama_members
    // that may cause recursion. We'll fetch members separately using admin client.
// Use user-scoped client when Authorization header is present so creator can see private chamas
const authHeader = req.headers.get("Authorization") || undefined;
const readClient = authHeader
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
  : publicClient;

const { data: chamaById, error: errById } = await readClient
  .from("chama")
  .select("*")
  .or(`id.eq.${id},slug.eq.${id}`)
  .limit(1)
  .maybeSingle();

if (errById) {
      console.error("Error fetching chama (public client):", errById);
      // If it's a permission error from RLS on chama table, propagate it.
      return new Response(JSON.stringify({ error: errById.message || "Error loading chama" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

if (!chamaById) {
      return new Response(JSON.stringify({ error: "Chama not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Prepare result object
    const result: any = { ...chamaById };

    // If admin client available, fetch members bypassing RLS to avoid recursion
    if (adminClient) {
      try {
        const { data: members, error: membersError } = await adminClient
          .from("chama_members")
          .select(`
            id,
            user_id,
            member_code,
            is_manager,
            joined_at,
            status,
            approval_status,
            order_index,
            chama_id,
            profiles ( id, full_name, email, phone )
          `)
          .eq("chama_id", chamaById.id)
          .order("order_index", { ascending: true });

        if (membersError) {
          console.error("adminClient error fetching chama_members:", membersError);
          // don't fail the whole response if members query error; return chama without members
          result.chama_members = [];
        } else {
          result.chama_members = members ?? [];
        }
      } catch (e) {
        console.error("Unexpected error fetching chama_members with adminClient:", e);
        result.chama_members = [];
      }
    } else {
      // If no admin client, attempt to fetch members using public client (may hit RLS).
      try {
        const { data: membersPublic, error: membersPublicError } = await publicClient
          .from("chama_members")
          .select("*, profiles ( id, full_name, email, phone )")
          .eq("chama_id", chamaById.id)
          .order("order_index", { ascending: true });

        if (membersPublicError) {
          console.warn("publicClient could not fetch chama_members (RLS likely):", membersPublicError);
          result.chama_members = [];
        } else {
          result.chama_members = membersPublic ?? [];
        }
      } catch (e) {
        console.error("Unexpected error fetching members with publicClient:", e);
        result.chama_members = [];
      }
    }

return new Response(JSON.stringify({ data: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
} catch (err: any) {
    console.error("Unhandled error in chama-crud GET handler:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

async function handlePost(req: Request) {
  try {
    // Accept id/slug in POST body and delegate to GET handler for unified logic
    let id: string | null = null;
    try {
      const j = await req.json().catch(() => null);
      if (j && (j.id || j.slug)) {
        id = j.id ?? j.slug;
      }
    } catch (_) {
      // ignore
    }

    if (id) {
      const url = new URL(req.url);
      url.searchParams.set("id", String(id));
      const getReq = new Request(url.toString(), { method: "GET", headers: req.headers });
      return await handleGet(getReq);
    }

    // Fallback to GET logic (will try query params too)
    return await handleGet(req);
  } catch (err: any) {
    console.error("Unhandled error in chama-crud POST handler:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500 });
  }
}

addEventListener("fetch", (event: any) => {
  event.respondWith(
    (async () => {
      const req = event.request as Request;
      try {
// Support CORS preflight and both GET/POST
        if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
        if (req.method === "GET") return await handleGet(req);
        if (req.method === "POST") return await handlePost(req);
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err: any) {
        console.error("Error in chama-crud:", err);
return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    })()
  );
});
