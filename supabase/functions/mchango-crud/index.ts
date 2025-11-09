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
    console.log('mchango-crud request', { method: req.method, hasAuth: !!authHeader });
    
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
    const id = lastPart === 'mchango-crud' ? null : lastPart;
    console.log('mchango-crud request', { method: req.method, path: url.pathname, hasAuth: !!authHeader });

    // GET /mchango-crud - List all active public mchangos (or user's own)
    if (req.method === 'GET' && !id) {
      const userRes = token
        ? await supabaseClient.auth.getUser(token)
        : await supabaseClient.auth.getUser();
      const user = userRes.data.user;

      let query = supabaseClient
        .from('mchango')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      // If no user, only show public mchangos
      if (!user) {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /mchango-crud/:id - Get single mchango by ID or slug
    if (req.method === 'GET' && id) {
      let query = supabaseClient
        .from('mchango')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email,
            phone
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
        return new Response(JSON.stringify({ error: 'Mchango not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /mchango-crud - Create new mchango (KYC-approved users only)
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Require authentication
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      console.log('mchango-crud POST user', { hasUser: !!user, userId: user?.id });

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify KYC status
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
        return new Response(
          JSON.stringify({ 
            error: 'You must complete verification before creating a Mchango.',
            message: 'Only KYC-approved users can create mchangos. Please complete your KYC verification first.',
            kyc_status: profile.kyc_status
          }), 
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validate required fields
      if (!body.title || !body.target_amount) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: title, target_amount' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Generate slug from title
      let slug = body.slug || body.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

      // Check slug uniqueness, append timestamp if needed
      const { data: existingSlug } = await supabaseClient
        .from('mchango')
        .select('slug')
        .eq('slug', slug)
        .maybeSingle();

      if (existingSlug) {
        slug = `${slug}-${Date.now()}`;
      }

      const { data, error } = await supabaseClient
        .from('mchango')
        .insert({
          title: body.title,
          description: body.description,
          target_amount: body.target_amount,
          end_date: body.end_date,
          beneficiary_url: body.beneficiary_url,
          whatsapp_link: body.whatsapp_link,
          category: body.category,
          is_public: body.is_public !== undefined ? body.is_public : true,
          managers: body.managers || [],
          slug: slug,
          created_by: user.id,
          image_url: body.image_url,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating mchango:', error);
        throw error;
      }

      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /mchango-crud/:id - Update mchango
    if (req.method === 'PUT' && id) {
      const body = await req.json();
      
      const { data, error } = await supabaseClient
        .from('mchango')
        .update(body)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /mchango-crud/:id - Soft delete (set status to cancelled)
    if (req.method === 'DELETE' && id) {
      const { data, error } = await supabaseClient
        .from('mchango')
        .update({ status: 'cancelled' })
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
    console.error('Error in mchango-crud:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
