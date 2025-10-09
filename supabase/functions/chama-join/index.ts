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
    
    console.log('chama-join request', { method: req.method, hasAuth: !!authHeader });

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please login to join a chama.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /chama-join - Join chama using invite code
    if (req.method === 'POST') {
      const body = await req.json();
      const { code } = body;

      if (!code) {
        return new Response(JSON.stringify({ error: 'Invite code is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate invite code
      const { data: inviteCode, error: inviteError } = await supabaseClient
        .from('chama_invite_codes')
        .select('*, chama(*)')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .is('used_by', null)
        .single();

      if (inviteError || !inviteCode) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invite code' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check expiration
      if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Invite code has expired' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user is already a member
      const { data: existingMember } = await supabaseClient
        .from('chama_members')
        .select('id, status, approval_status')
        .eq('chama_id', inviteCode.chama_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingMember) {
        if (existingMember.approval_status === 'pending') {
          return new Response(JSON.stringify({ 
            error: 'You already have a pending join request for this chama' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (existingMember.approval_status === 'approved') {
          return new Response(JSON.stringify({ 
            error: 'You are already a member of this chama' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Get next order_index
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select('order_index')
        .eq('chama_id', inviteCode.chama_id)
        .not('order_index', 'is', null)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrderIndex = members && members.length > 0 
        ? (members[0].order_index || 0) + 1 
        : 2; // Start at 2 (creator is 1)

      // Generate member code
      const { data: memberCodeData } = await supabaseClient
        .rpc('generate_member_code', { 
          p_chama_id: inviteCode.chama_id,
          p_order_index: nextOrderIndex 
        });

      // Create pending membership
      const { data: newMember, error: memberError } = await supabaseClient
        .from('chama_members')
        .insert({
          chama_id: inviteCode.chama_id,
          user_id: user.id,
          member_code: memberCodeData,
          order_index: nextOrderIndex,
          is_manager: false,
          status: 'active',
          approval_status: 'pending',
        })
        .select()
        .single();

      if (memberError) {
        console.error('Error creating member:', memberError);
        throw memberError;
      }

      // Mark invite code as used
      await supabaseClient
        .from('chama_invite_codes')
        .update({ 
          used_by: user.id,
          used_at: new Date().toISOString(),
          is_active: false
        })
        .eq('id', inviteCode.id);

      console.log(`User ${user.id} joined chama ${inviteCode.chama_id} with code ${code}`);

      return new Response(JSON.stringify({ 
        data: newMember,
        message: 'Join request submitted. Awaiting manager approval.' 
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /chama-join/approve/:member_id - Approve join request
    if (req.method === 'PUT') {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const memberId = pathParts[pathParts.length - 1];
      const body = await req.json();
      const { action } = body; // 'approve' or 'reject'

      if (!['approve', 'reject'].includes(action)) {
        return new Response(JSON.stringify({ error: 'Action must be approve or reject' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get member details
      const { data: member, error: memberFetchError } = await supabaseClient
        .from('chama_members')
        .select('chama_id, approval_status')
        .eq('id', memberId)
        .single();

      if (memberFetchError || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if requester is manager
      const { data: requesterMembership } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', member.chama_id)
        .eq('user_id', user.id)
        .eq('approval_status', 'approved')
        .single();

      if (!requesterMembership || !requesterMembership.is_manager) {
        return new Response(JSON.stringify({ error: 'Only managers can approve join requests' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update approval status
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const { data, error } = await supabaseClient
        .from('chama_members')
        .update({ approval_status: newStatus })
        .eq('id', memberId)
        .select()
        .single();

      if (error) throw error;

      console.log(`Member ${memberId} ${newStatus} by manager ${user.id}`);

      return new Response(JSON.stringify({ 
        data,
        message: `Join request ${newStatus}` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-join/pending/:chama_id - Get pending join requests
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const chamaId = pathParts[pathParts.length - 1];

      const { data, error } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles (
            full_name,
            email,
            phone
          )
        `)
        .eq('chama_id', chamaId)
        .eq('approval_status', 'pending')
        .order('joined_at', { ascending: true });

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
    console.error('Error in chama-join:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
