import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Get user from auth header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Remove function name from path if present
  if (pathParts[0] === 'chama-rejoin') {
    pathParts.shift();
  }

  try {
    // GET /chama-rejoin/summary/:chamaId - Public summary for any member
    if (req.method === 'GET' && pathParts.length === 2 && pathParts[0] === 'summary') {
      const chamaId = pathParts[1];

      // Get approved count
      const { count: approvedCount } = await supabase
        .from('chama_rejoin_requests')
        .select('id', { count: 'exact', head: true })
        .eq('chama_id', chamaId)
        .eq('status', 'approved');

      // Get approved members with profiles
      const { data: approvedMembers } = await supabase
        .from('chama_rejoin_requests')
        .select('id, user_id, status, profiles!chama_rejoin_requests_user_id_fkey(full_name)')
        .eq('chama_id', chamaId)
        .eq('status', 'approved');

      // Get current user's own request
      const { data: myRequest } = await supabase
        .from('chama_rejoin_requests')
        .select('id, status, requested_at')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      return new Response(
        JSON.stringify({
          approvedCount: approvedCount || 0,
          approvedMembers: (approvedMembers || []).map(m => ({
            id: m.id,
            user_id: m.user_id,
            full_name: (m.profiles as any)?.full_name || 'Unknown',
          })),
          myRequest,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /chama-rejoin - Submit rejoin request
    if (req.method === 'POST' && pathParts.length === 0) {
      const { chamaId } = await req.json();

      // Find previous membership
      const { data: previousMember } = await supabase
        .from('chama_members')
        .select('id')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isReturningMember = !!previousMember;

      // Check if request already exists
      const { data: existingRequest } = await supabase
        .from('chama_rejoin_requests')
        .select('id, status')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (existingRequest) {
        return new Response(
          JSON.stringify({ error: 'You already have a pending or approved rejoin request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Auto-approve returning members, pending for new members
      const requestStatus = isReturningMember ? 'approved' : 'pending';

      // Create rejoin request
      const { data: request, error: insertError } = await supabase
        .from('chama_rejoin_requests')
        .insert({
          chama_id: chamaId,
          user_id: user.id,
          previous_member_id: previousMember?.id,
          status: requestStatus
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Get chama and manager info
      const { data: chama } = await supabase
        .from('chama')
        .select(`
          name,
          chama_members!inner(
            profiles!inner(full_name, phone)
          )
        `)
        .eq('id', chamaId)
        .eq('chama_members.is_manager', true)
        .in('chama_members.status', ['active', 'inactive', 'removed'])
        .single();

      // Get requester profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      // Send SMS to manager
      if (chama && chama.chama_members[0]) {
        const manager = chama.chama_members[0];
        const managerProfile = manager.profiles as any;
        const message = isReturningMember
          ? `✅ ${profile?.full_name} has re-joined "${chama.name}" (auto-approved as returning member).`
          : `🆕 New member ${profile?.full_name} requests to join "${chama.name}". Log in to approve or reject.`;
        
        await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: managerProfile.phone,
            message,
            eventType: isReturningMember ? 'rejoin_auto_approved' : 'rejoin_request_submitted'
          }
        });
      }

      return new Response(
        JSON.stringify({ success: true, request }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /chama-rejoin/:chamaId - Get all requests for a chama (manager only)
    if (req.method === 'GET' && pathParts.length === 1) {
      const chamaId = pathParts[0];

      // Verify user is manager (allow inactive/removed status for cycle_complete chamas)
      const { data: membership } = await supabase
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chamaId)
        .eq('user_id', user.id)
        .eq('is_manager', true)
        .in('status', ['active', 'removed', 'inactive'])
        .maybeSingle();

      if (!membership?.is_manager) {
        return new Response(
          JSON.stringify({ error: 'Only managers can view rejoin requests' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: requests, error } = await supabase
        .from('chama_rejoin_requests')
        .select(`
          *,
          profiles!chama_rejoin_requests_user_id_fkey(full_name, phone, email),
          previous_member:chama_members!chama_rejoin_requests_previous_member_id_fkey(order_index, member_code)
        `)
        .eq('chama_id', chamaId)
        .order('requested_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ requests }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH /chama-rejoin/:requestId - Approve/reject request (manager only)
    if (req.method === 'PATCH' && pathParts.length === 1) {
      const requestId = pathParts[0];
      const { status, notes } = await req.json();

      if (!['approved', 'rejected'].includes(status)) {
        return new Response(
          JSON.stringify({ error: 'Invalid status. Must be "approved" or "rejected"' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get request details
      const { data: request } = await supabase
        .from('chama_rejoin_requests')
        .select('*, chama!inner(name, id)')
        .eq('id', requestId)
        .single();

      if (!request) {
        return new Response(
          JSON.stringify({ error: 'Request not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify user is manager (allow inactive/removed status for cycle_complete chamas)
      const { data: membership } = await supabase
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', request.chama_id)
        .eq('user_id', user.id)
        .eq('is_manager', true)
        .in('status', ['active', 'removed', 'inactive'])
        .maybeSingle();

      if (!membership?.is_manager) {
        return new Response(
          JSON.stringify({ error: 'Only managers can approve/reject requests' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update request
      const { error: updateError } = await supabase
        .from('chama_rejoin_requests')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          notes
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Get requester profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', request.user_id)
        .single();

      // Send SMS to requester
      if (profile) {
        const message = status === 'approved'
          ? `✅ Your rejoin request for "${request.chama.name}" has been approved! You'll be notified when the new cycle starts with your new payout position.`
          : `❌ Your rejoin request for "${request.chama.name}" was not approved. ${notes || 'Please contact the manager for more information.'}`;

        await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: profile.phone,
            message,
            eventType: status === 'approved' ? 'rejoin_approved' : 'rejoin_rejected'
          }
        });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in chama-rejoin:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
