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
    
    const body = req.method !== 'GET' && req.method !== 'OPTIONS' 
      ? await req.json() 
      : null;
    const action = body?.action;
    
    console.log('chama-invite request', { method: req.method, action, hasAuth: !!authHeader });

    // Public endpoint - validate code (no auth required)
    if (action === 'validate' && body?.code) {
      const code = body.code;
      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required', valid: false }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data, error } = await adminClient
        .from('chama_invite_codes')
        .select(`*, chama (id, name, slug, description, contribution_amount, contribution_frequency, max_members, status)`)
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invite code', valid: false, message: 'This invite code is not valid. Please check with the chama manager.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if code has reached max uses
      if (data.use_count >= data.max_uses) {
        return new Response(JSON.stringify({ error: 'Invite code has been fully used', valid: false }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (data.chama?.status === 'completed' || data.chama?.status === 'deleted') {
        return new Response(JSON.stringify({ error: 'This Chama is no longer accepting new members', valid: false }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Invite code has expired', valid: false }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ chama: data.chama, valid: true, uses_remaining: data.max_uses - data.use_count }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All other endpoints require authentication
    const jwt = authHeader?.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate new invite code — SINGLE ACTIVE ONLY
    if (action === 'generate') {
      const { chama_id, expires_in_days, max_uses } = body;

      if (!chama_id) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allowedMaxUses = Math.max(1, Math.min(Number(max_uses) || 1, 100));

      // Verify user is a manager
      const { data: membership, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chama_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (memberError || !membership || !membership.is_manager) {
        return new Response(JSON.stringify({ error: 'Only chama managers can generate invite codes' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // DEACTIVATE all existing active codes for this chama that still have remaining uses
      await supabaseClient
        .from('chama_invite_codes')
        .update({ is_active: false })
        .eq('chama_id', chama_id)
        .eq('is_active', true);

      console.log('Deactivated all previous active codes for chama', chama_id);

      // Generate new code
      const code = Array.from({ length: 8 }, () => 
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
      ).join('');

      const expiresAt = expires_in_days 
        ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .insert({ chama_id, created_by: user.id, code, expires_at: expiresAt, is_active: true, max_uses: allowedMaxUses, use_count: 0 })
        .select(`*, chama (id, name, slug)`)
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to generate invite code', details: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // List invite codes for a chama — only show active unused
    if (action === 'list') {
      const chamaId = body?.chama_id;
      if (!chamaId) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: membership, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .eq('is_manager', true)
        .in('status', ['active', 'removed'])
        .maybeSingle();

      if (memberError || !membership || !membership.is_manager) {
        return new Response(JSON.stringify({ error: 'Only chama managers can view invite codes' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Only return active, unused codes
      const { data, error } = await supabaseClient
        .from('chama_invite_codes')
        .select('*')
        .eq('chama_id', chamaId)
        .eq('is_active', true)
        .is('used_by', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to load invite codes' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Deactivate invite code
    if (req.method === 'DELETE') {
      const code = pathParts[pathParts.length - 1];
      if (!code) {
        return new Response(JSON.stringify({ error: 'Code is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: inviteCode } = await supabaseClient
        .from('chama_invite_codes')
        .select('chama_id')
        .eq('code', code.toUpperCase())
        .single();

      if (!inviteCode) {
        return new Response(JSON.stringify({ error: 'Invite code not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: membership } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', inviteCode.chama_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!membership || !membership.is_manager) {
        return new Response(JSON.stringify({ error: 'Only chama managers can deactivate invite codes' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabaseClient
        .from('chama_invite_codes')
        .update({ is_active: false })
        .eq('code', code.toUpperCase());

      return new Response(JSON.stringify({ message: 'Invite code deactivated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('chama-invite error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
