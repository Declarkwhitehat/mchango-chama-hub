import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim() || null;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: authHeader ? { Authorization: authHeader } : {} }, auth: { persistSession: false } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    const id = lastPart === 'welfare-crud' ? null : lastPart;

    // GET - List or detail
    if (req.method === 'GET') {
      if (!id) {
        // List user's welfares
        let user = null;
        if (token) {
          const { data: userData } = await supabaseAdmin.auth.getUser(token);
          user = userData?.user;
        }

        if (user) {
          // Get welfares where user is a member
          const { data: memberships } = await supabaseClient
            .from('welfare_members')
            .select('welfare_id')
            .eq('user_id', user.id)
            .eq('status', 'active');

          const welfareIds = memberships?.map(m => m.welfare_id) || [];

          if (welfareIds.length === 0) {
            return new Response(JSON.stringify({ data: [] }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const { data, error } = await supabaseClient
            .from('welfares')
            .select('*, welfare_members(id, user_id, role, status, member_code, total_contributed, profiles:user_id(full_name, phone))')
            .in('id', welfareIds)
            .order('created_at', { ascending: false });

          if (error) throw error;
          return new Response(JSON.stringify({ data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Public listing
        const { data, error } = await supabaseClient
          .from('welfares')
          .select('id, name, slug, description, status, is_public, group_code, created_at')
          .eq('status', 'active')
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Detail by ID or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const selectQuery = `*, welfare_members(id, user_id, role, status, member_code, total_contributed, joined_at, is_eligible_for_withdrawal, profiles:user_id(full_name, phone, email))`;

      let data, error;
      if (isUuid) {
        ({ data, error } = await supabaseClient.from('welfares').select(selectQuery).eq('id', id).single());
      } else {
        ({ data, error } = await supabaseClient.from('welfares').select(selectQuery).eq('slug', id).single());
      }

      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST - Create welfare
    if (req.method === 'POST') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const body = await req.json();
      const { name, description, is_public, whatsapp_link, min_contribution_period_months } = body;

      if (!name || name.trim().length < 3) {
        return new Response(JSON.stringify({ error: 'Name must be at least 3 characters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Generate slug
      const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/-+$/, '') + '-' + Math.random().toString(36).substring(2, 6);

      const { data, error } = await supabaseClient
        .from('welfares')
        .insert({
          created_by: userData.user.id,
          name: name.trim(),
          slug,
          description: description || null,
          is_public: is_public !== false,
          whatsapp_link: whatsapp_link || null,
          min_contribution_period_months: min_contribution_period_months || 3,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT - Update welfare (Chairman only)
    if (req.method === 'PUT' && id) {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const body = await req.json();
      const { name, description, is_public, whatsapp_link, min_contribution_period_months } = body;

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (is_public !== undefined) updateData.is_public = is_public;
      if (whatsapp_link !== undefined) updateData.whatsapp_link = whatsapp_link;
      if (min_contribution_period_months !== undefined) updateData.min_contribution_period_months = min_contribution_period_months;

      const { data, error } = await supabaseClient
        .from('welfares')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-crud error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
