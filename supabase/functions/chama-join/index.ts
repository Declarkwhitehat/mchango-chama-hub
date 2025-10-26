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

    // Only require auth for actual join requests (POST), not for validation
    const token = authHeader?.replace('Bearer ', '').trim();
    let user = null;
    
    if (req.method === 'POST' || req.method === 'PUT') {
      const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token);
      console.log('Auth check:', { hasUser: !!authUser, hasToken: !!token, authError: authError?.message });
      
      if (!authUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized. Please login to join a chama.', details: authError?.message }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = authUser;
    }

    // POST /chama-join - Join chama using invite code
    if (req.method === 'POST') {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Authentication required to join chama' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let body;
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const { chama_id, invite_code } = body;

      if (!chama_id) {
        return new Response(JSON.stringify({ error: 'Chama ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!invite_code) {
        return new Response(JSON.stringify({ error: 'Invite code is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate invite code
      const { data: inviteCodeData, error: codeError } = await supabaseClient
        .from('chama_invite_codes')
        .select('id, chama_id, is_active, expires_at, used_by')
        .eq('code', invite_code)
        .eq('chama_id', chama_id)
        .single();

      if (codeError || !inviteCodeData) {
        return new Response(JSON.stringify({ error: 'Invalid invite code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!inviteCodeData.is_active) {
        return new Response(JSON.stringify({ error: 'This invite code is no longer active' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (inviteCodeData.used_by) {
        return new Response(JSON.stringify({ error: 'This invite code has already been used' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (inviteCodeData.expires_at && new Date(inviteCodeData.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'This invite code has expired' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify chama exists and is public/active
      const { data: chama, error: chamaError } = await supabaseClient
        .from('chama')
        .select('id, name, is_public, status')
        .eq('id', chama_id)
        .single();

      if (chamaError || !chama) {
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!chama.is_public || chama.status !== 'active') {
        return new Response(JSON.stringify({ error: 'This chama is not accepting new members' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user is already a member
      const { data: existingMember } = await supabaseClient
        .from('chama_members')
        .select('id, status, approval_status')
        .eq('chama_id', chama_id)
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

      // Get next order_index - STRICTLY based on join date order
      // Order index determines payout position and is automatically assigned
      // IMPORTANT: Once assigned, order_index CANNOT be modified by anyone (enforced by database trigger)
      // This ensures fair, transparent payout order based solely on when members joined
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select('order_index, joined_at')
        .eq('chama_id', chama_id)
        .not('order_index', 'is', null)
        .order('order_index', { ascending: false })
        .limit(1);

      // Calculate next sequential order index
      // Creator has order_index = 1, subsequent members get 2, 3, 4, etc.
      const nextOrderIndex = members && members.length > 0 
        ? (members[0].order_index || 0) + 1 
        : 2; // Start at 2 (creator is always 1)

      // Generate member code
      const { data: memberCodeData } = await supabaseClient
        .rpc('generate_member_code', { 
          p_chama_id: chama_id,
          p_order_index: nextOrderIndex 
        });

      // Create pending membership
      const { data: newMember, error: memberError } = await supabaseClient
        .from('chama_members')
        .insert({
          chama_id: chama_id,
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
        return new Response(JSON.stringify({ 
          error: 'Failed to create membership', 
          details: memberError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark invite code as used
      await supabaseClient
        .from('chama_invite_codes')
        .update({
          is_active: false,
          used_by: user.id,
          used_at: new Date().toISOString(),
        })
        .eq('id', inviteCodeData.id);

      console.log(`User ${user.id} requested to join chama ${chama_id} using code ${invite_code}`);

      return new Response(JSON.stringify({ 
        data: newMember,
        message: 'Join request submitted. Awaiting manager approval.' 
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /chama-join/approve/:member_id - Approve or reject join request
    if (req.method === 'PUT') {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const url = new URL(req.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      // Handle both /chama-join/approve/member_id and /chama-join/member_id patterns
      let memberId: string;
      if (pathParts.includes('approve')) {
        // If 'approve' is in the path, get the part after it
        const approveIndex = pathParts.indexOf('approve');
        memberId = pathParts[approveIndex + 1];
      } else {
        // Otherwise get the last part
        memberId = pathParts[pathParts.length - 1];
      }
      
      if (!memberId) {
        return new Response(JSON.stringify({ error: 'Member ID is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const { approved } = body; // boolean: true for approve, false for reject

      if (typeof approved !== 'boolean') {
        return new Response(JSON.stringify({ error: 'approved must be a boolean (true or false)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get member details
      const { data: member, error: memberFetchError } = await supabaseClient
        .from('chama_members')
        .select('chama_id, approval_status, user_id')
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
        return new Response(JSON.stringify({ error: 'Only managers can approve or reject join requests' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update approval status
      const newStatus = approved ? 'approved' : 'rejected';
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
        message: approved 
          ? 'Join request approved! Member has been added to the chama.' 
          : 'Join request rejected.' 
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
          profiles!chama_members_user_id_fkey (
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
