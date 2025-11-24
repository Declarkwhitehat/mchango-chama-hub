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
    
    // Get body for action-based routing
    const body = req.method !== 'GET' && req.method !== 'OPTIONS' 
      ? await req.json() 
      : null;
    const action = body?.action;
    
    console.log('chama-invite request', { 
      method: req.method, 
      action,
      body,
      pathParts,
      hasAuth: !!authHeader 
    });

    // Public endpoint - validate code (no auth required)
    if (action === 'validate' && body?.code) {
      const code = body.code;
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
    const jwt = authHeader?.replace('Bearer ', '');
    if (!jwt) {
      console.error('No JWT token provided');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);

    console.log('Auth check:', { 
      hasUser: !!user, 
      userId: user?.id,
      authError: authError?.message 
    });

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new invite code
    if (action === 'generate') {
      console.log('Generate invite code request');
      const { chama_id, expires_in_days } = body;

      if (!chama_id) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user is a manager
      console.log('Checking manager status:', { userId: user.id, chamaId: chama_id });
      
      const { data: membership, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chama_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      console.log('Manager check result:', { membership, error: memberError });

      if (memberError || !membership || !membership.is_manager) {
        console.error('Manager verification failed:', memberError);
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

      console.log('Generated code:', code);

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

      console.log('Insert result:', { success: !!data, error: error?.message });

      if (error) {
        console.error('Failed to generate invite code:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to generate invite code', details: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Successfully generated invite code');
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // List invite codes for a chama
    if (action === 'list') {
      const chamaId = body?.chama_id;

      console.log('List invite codes request:', { chamaId });

      if (!chamaId) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user is a manager
      console.log('Verifying manager status for list:', { userId: user.id, chamaId });
      
      const { data: membership, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      console.log('Manager check for list:', { membership, error: memberError });

      if (memberError || !membership || !membership.is_manager) {
        console.error('Manager verification failed for list:', memberError);
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
