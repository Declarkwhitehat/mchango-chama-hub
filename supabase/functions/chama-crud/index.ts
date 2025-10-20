import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim() || null;
    
    // Create Supabase client with anon key and forward Authorization for user context
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    const id = lastPart === 'chama-crud' ? null : lastPart;
    console.log('chama-crud request', { method: req.method, path: url.pathname, hasAuth: !!authHeader });

    // GET /chama-crud - List all active chamas
    if (req.method === 'GET' && !id) {
      const { data, error } = await supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          ),
          chama_members (
            id,
            member_code,
            is_manager,
            status
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-crud/:id - Get single chama by ID or slug
    if (req.method === 'GET' && id) {
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
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
