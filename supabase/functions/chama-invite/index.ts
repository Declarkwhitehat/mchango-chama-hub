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
    
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];
    
    console.log('chama-invite request', { 
      method: req.method, 
      path: req.url,
      pathname: url.pathname,
      pathParts,
      action,
      hasAuth: !!authHeader 
    });

    // Public endpoint - GET /chama-invite/validate/:code - Validate invite code
    if (req.method === 'GET' && pathParts.includes('validate')) {
      const codeIndex = pathParts.indexOf('validate') + 1;
      const code = pathParts[codeIndex];

      if (!code) {
        return new Response(JSON.stringify({ 
          error: 'Code is required',
          valid: false 
        }), {
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
          valid: false,
          message: 'This invite code is not valid. Please check with the chama manager.'
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({ 
          error: 'Invite code has expired',
          valid: false,
          message: 'This invite code has expired. Please request a new one from the chama manager.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        chama: data.chama, 
        valid: true 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All other endpoints require authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /chama-invite/generate - Generate new invite code
    if (req.method === 'POST' && (action === 'generate' || pathParts.includes('generate'))) {
      const body = await req.json();
      const { chama_id, expires_in_days } = body;

      if (!chama_id) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user is a manager
      const { data: membership } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chama_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!membership || !membership.is_manager) {
        return new Response(JSON.stringify({ 
          error: 'Only chama managers can generate invite codes' 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate code
      const code = Array.from({ length: 8 }, () => 
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
      ).join('');

      const expiresAt = expires_in_days 
        ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .insert({
          chama_id,
          created_by: user.id,
          code,
          expires_at: expiresAt,
          is_active: true,
        })
        .select(`
          *,
          chama (
            id,
            name,
            slug
          )
        `)
        .single();

      if (error) {
        console.error('Failed to generate invite code:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to generate invite code' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-invite/:chama_id - List invite codes for a chama
    if (req.method === 'GET') {
      const chamaId = pathParts[pathParts.length - 1];

      if (!chamaId || chamaId === 'chama-invite') {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user is a manager
      const { data: membership } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!membership || !membership.is_manager) {
        return new Response(JSON.stringify({ 
          error: 'Only chama managers can view invite codes' 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .select('*')
        .eq('chama_id', chamaId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to list invite codes:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to load invite codes' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /chama-invite/:code - Deactivate invite code
    if (req.method === 'DELETE') {
      const code = pathParts[pathParts.length - 1];

      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get the invite code with chama info
      const { data: inviteCode } = await supabaseClient
        .from('chama_invite_codes')
        .select('chama_id')
        .eq('code', code.toUpperCase())
        .single();

      if (!inviteCode) {
        return new Response(JSON.stringify({ error: 'Invite code not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user is a manager
      const { data: membership } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', inviteCode.chama_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!membership || !membership.is_manager) {
        return new Response(JSON.stringify({ 
          error: 'Only chama managers can deactivate invite codes' 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseClient
        .from('chama_invite_codes')
        .update({ is_active: false })
        .eq('code', code.toUpperCase());

      if (error) {
        console.error('Failed to deactivate invite code:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to deactivate invite code' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ message: 'Invite code deactivated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('chama-invite error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
