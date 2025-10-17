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
      return new Response(JSON.stringify({ error: "Missing id or slug in request" }), { status: 400 });
    }

    // First try to fetch the chama row via public client.
    // We will not request nested chama_members here to avoid policies running on chama_members
    // that may cause recursion. We'll fetch members separately using admin client.
    const { data: chamaById, error: errById } = await publicClient
      .from("chama")
      .select("*")
      .or(`id.eq.${id},slug.eq.${id}`)
      .limit(1)
      .maybeSingle();

    if (errById) {
      console.error("Error fetching chama (public client):", errById);
      // If it's a permission error from RLS on chama table, propagate it.
      return new Response(JSON.stringify({ error: errById.message || "Error loading chama" }), { status: 500 });
    }

    if (!chamaById) {
      return new Response(JSON.stringify({ error: "Chama not found" }), { status: 404 });
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
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Unhandled error in chama-crud GET handler:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500 });
  }
}

async function handlePost(req: Request) {
  // If your function supports create/update via POST, keep your existing logic here.
  // For safety I return 405 to avoid accidental behavior. You can implement create/update using adminClient.
  return new Response(JSON.stringify({ error: "POST not implemented in this handler. Use designated create endpoint." }), { status: 405 });
}

addEventListener("fetch", (event: any) => {
  event.respondWith(
    (async () => {
      const req = event.request as Request;
      try {
        // Support GET and POST if needed
        if (req.method === "GET") return await handleGet(req);
        if (req.method === "POST") return await handlePost(req);
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
      } catch (err: any) {
        console.error("Error in chama-crud:", err);
        return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500 });
      }
    })()
  );
});      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /chama-crud - Create new chama (but also handle GET-style invocations with ID)
    if (req.method === 'POST' && !id) {
      const body = await req.json();
      const userRes = token
        ? await supabaseClient.auth.getUser(token)
        : await supabaseClient.auth.getUser();
      const user = userRes.data.user;
      console.log('chama-crud POST user', { hasUser: !!user, userId: user?.id });

      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check KYC status
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('kyc_status')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (profile.kyc_status !== 'approved') {
        return new Response(JSON.stringify({ 
          error: 'You must complete verification before creating a Chama.',
          message: 'Only KYC-approved users can create chamas. Please complete your KYC verification first.',
          kyc_status: profile.kyc_status
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate constraints
      const minMembers = body.min_members || 5;
      const maxMembers = body.max_members || 50;

      if (minMembers < 5) {
        return new Response(JSON.stringify({ error: 'Minimum members must be at least 5' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (maxMembers > 100) {
        return new Response(JSON.stringify({ error: 'Maximum members cannot exceed 100' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (maxMembers < minMembers) {
        return new Response(JSON.stringify({ error: 'Maximum members must be greater than minimum members' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate every_n_days_count if frequency is every_n_days
      if (body.contribution_frequency === 'every_n_days' && (!body.every_n_days_count || body.every_n_days_count < 1)) {
        return new Response(JSON.stringify({ error: 'Every N days count must be specified and greater than 0' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate slug from name
      const slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

      const { data, error } = await supabaseClient
        .from('chama')
        .insert({
          name: body.name,
          description: body.description,
          slug: body.slug || slug,
          contribution_amount: body.contribution_amount,
          contribution_frequency: body.contribution_frequency,
          every_n_days_count: body.every_n_days_count,
          min_members: minMembers,
          max_members: maxMembers,
          is_public: body.is_public !== undefined ? body.is_public : true,
          payout_order: body.payout_order || 'join_date',
          commission_rate: body.commission_rate || 0.05,
          whatsapp_link: body.whatsapp_link,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Chama creation error:', error);
        throw error;
      }

      // Creator is automatically added as manager via trigger
      console.log('Chama created successfully:', data.id);

      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /chama-crud/:id - Handle as GET for viewing chama details
    if (req.method === 'POST' && id) {
      let query = supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email,
            phone
          ),
          chama_members (
            id,
            user_id,
            member_code,
            is_manager,
            joined_at,
            status,
            approval_status,
            order_index,
            profiles (
              full_name,
              email
            )
          )
        `);

      // Try by slug first, then by ID
      const { data: bySlug } = await query.eq('slug', id).maybeSingle();
      
      if (bySlug) {
        return new Response(JSON.stringify({ data: bySlug }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await query.eq('id', id).maybeSingle();
      
      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /chama-crud/:id - Update chama
    if (req.method === 'PUT' && id) {
      const body = await req.json();
      
      const { data, error } = await supabaseClient
        .from('chama')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /chama-crud/:id - Soft delete (set status to inactive)
    if (req.method === 'DELETE' && id) {
      const { data, error } = await supabaseClient
        .from('chama')
        .update({ status: 'inactive' })
        .eq('id', id)
        .select()
        .singl
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in chama-crud:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
