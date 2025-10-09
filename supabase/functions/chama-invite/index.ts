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
    const authHeader = req.headers.get('Authorization') || undefined;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    );
    
    console.log('chama-invite request', { method: req.method, path: req.url, hasAuth: !!authHeader });

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /chama-invite/generate - Generate invite codes
    if (req.method === 'POST' && action === 'generate') {
      const body = await req.json();
      const { chama_id, count = 1, expires_in_days = null } = body;

      if (!chama_id) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user is manager
      const { data: membership } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chama_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .single();

      if (!membership || !membership.is_manager) {
        return new Response(JSON.stringify({ error: 'Only managers can generate invite codes' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check available spots
      const { data: chama } = await supabaseClient
        .from('chama')
        .select('max_members')
        .eq('id', chama_id)
        .single();

      const { count: currentMembers } = await supabaseClient
        .from('chama_members')
        .select('*', { count: 'exact', head: true })
        .eq('chama_id', chama_id)
        .in('approval_status', ['approved', 'pending']);

      const availableSpots = chama.max_members - (currentMembers || 0);

      if (count > availableSpots) {
        return new Response(JSON.stringify({ 
          error: `Only ${availableSpots} spots available. Cannot generate ${count} codes.` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate codes
      const codes = [];
      const expiresAt = expires_in_days 
        ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      for (let i = 0; i < count; i++) {
        const { data: codeData } = await supabaseClient.rpc('generate_invite_code');
        
        const { data: inviteCode, error } = await supabaseClient
          .from('chama_invite_codes')
          .insert({
            chama_id,
            code: codeData,
            created_by: user.id,
            expires_at: expiresAt,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating invite code:', error);
          continue;
        }

        codes.push(inviteCode);
      }

      console.log(`Generated ${codes.length} invite codes for chama ${chama_id}`);

      return new Response(JSON.stringify({ data: codes }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-invite/list/:chama_id - List invite codes for chama
    if (req.method === 'GET' && action !== 'validate') {
      const chamaId = pathParts[pathParts.length - 1];

      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .select(`
          *,
          profiles!chama_invite_codes_created_by_fkey (
            full_name,
            email
          ),
          used_profile:profiles!chama_invite_codes_used_by_fkey (
            full_name,
            email
          )
        `)
        .eq('chama_id', chamaId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-invite/validate/:code - Validate invite code
    if (req.method === 'GET' && action === 'validate') {
      const code = url.searchParams.get('code');

      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .select(`
          *,
          chama (
            id,
            name,
            slug,
            description,
            contribution_amount,
            contribution_frequency
          )
        `)
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .is('used_by', null)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ 
          error: 'Invalid or expired invite code',
          valid: false 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({ 
          error: 'Invite code has expired',
          valid: false 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data, valid: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /chama-invite/:id - Deactivate invite code
    if (req.method === 'DELETE') {
      const codeId = pathParts[pathParts.length - 1];

      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .update({ is_active: false })
        .eq('id', codeId)
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
    console.error('Error in chama-invite:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
