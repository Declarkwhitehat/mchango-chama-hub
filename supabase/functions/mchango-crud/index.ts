import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const id = pathParts[pathParts.length - 1];

    // GET /mchango-crud - List all active mchangos
    if (req.method === 'GET' && !id) {
      const { data, error } = await supabaseClient
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

    // POST /mchango-crud - Create new mchango
    if (req.method === 'POST') {
      const body = await req.json();
      const { data: { user } } = await supabaseClient.auth.getUser();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate slug from title
      const slug = body.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

      const { data, error } = await supabaseClient
        .from('mchango')
        .insert({
          ...body,
          slug: body.slug || slug,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

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
    console.error('Error in mchango-crud:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
