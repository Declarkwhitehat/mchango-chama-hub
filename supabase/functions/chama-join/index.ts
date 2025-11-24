import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

// UUID validation helper
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeaderRaw = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const token = authHeaderRaw?.split(' ')[1];
    
    // With verify_jwt = true, the platform validates JWT before running the function
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      }
    );

    // Verify authentication for all requests
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Failed to get user from JWT:', authError);
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired token',
        code: 'AUTH_INVALID' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('chama-join request', { 
      method: req.method, 
      userId: user.id,
      timestamp: new Date().toISOString()
    });

    // POST /chama-join - Join a chama using invite code OR approve/reject join requests
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Check if this is an approval request
      if (body.member_id && (body.approved !== undefined || body.action)) {
        const { member_id, approved, action } = body;
        const memberId = member_id;
        const isApproved = approved !== undefined ? approved : action === 'approve';

        if (!memberId) {
          return new Response(JSON.stringify({ 
            error: 'Missing member_id',
            details: 'member_id is required'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!isValidUUID(memberId)) {
          return new Response(JSON.stringify({ 
            error: 'Invalid member ID format',
            details: 'member_id must be a valid UUID'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('Approval request:', { memberId, approved: isApproved });

        // Get member details
        const { data: member, error: memberError } = await supabaseClient
          .from('chama_members')
          .select('*, chama!inner(*)')
          .eq('id', memberId)
          .maybeSingle();

        if (memberError || !member) {
          console.error('Member lookup failed:', memberError);
          return new Response(JSON.stringify({ 
            error: 'Member not found',
            details: 'The member you are trying to approve does not exist'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Verify requester has manager permissions
        const { data: requesterMember, error: requesterError } = await supabaseClient
          .from('chama_members')
          .select('is_manager')
          .eq('chama_id', member.chama_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (requesterError || !requesterMember?.is_manager) {
          console.error('Manager check failed:', requesterError);
          return new Response(JSON.stringify({ 
            error: 'Access denied',
            details: 'Only chama managers can approve join requests'
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update membership status
        const { data: updatedMember, error: updateError } = await supabaseClient
          .from('chama_members')
          .update({
            approval_status: isApproved ? 'approved' : 'rejected',
            status: isApproved ? 'active' : 'inactive',
          })
          .eq('id', memberId)
          .select()
          .maybeSingle();

        if (updateError) {
          console.error('Update failed:', updateError);
          throw updateError;
        }

        console.log('Member status updated:', updatedMember);

        return new Response(JSON.stringify({ 
          success: true,
          message: `Member ${isApproved ? 'approved' : 'rejected'} successfully`,
          data: updatedMember 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Otherwise, handle as join request
      const { invite_code, chama_id } = body;

      console.log('Join request received:', { invite_code, chama_id, user_id: user.id });
      
      // Verify KYC status
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('kyc_status')
        .eq('id', user.id)
        .single();

      if (!profile || profile.kyc_status !== 'approved') {
        return new Response(JSON.stringify({ 
          error: 'KYC verification required to join a chama',
          kyc_status: profile?.kyc_status || 'unknown'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!invite_code || !chama_id) {
        return new Response(JSON.stringify({ 
          error: 'Missing required fields',
          details: 'invite_code and chama_id are required' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate chama_id UUID format
      if (!isValidUUID(chama_id)) {
        return new Response(JSON.stringify({ 
          error: 'Invalid chama ID format',
          details: 'chama_id must be a valid UUID'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify invite code exists and is valid
      const { data: inviteCode, error: inviteError } = await supabaseClient
        .from('chama_invite_codes')
        .select('*')
        .eq('code', invite_code)
        .eq('chama_id', chama_id)
        .eq('is_active', true)
        .maybeSingle();

      if (inviteError || !inviteCode) {
        console.error('Invite code validation failed:', inviteError);
        return new Response(JSON.stringify({ 
          error: 'Invalid or expired invite code',
          details: 'The invite code you entered is not valid or has expired'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if invite code was already used
      if (inviteCode.used_by) {
        return new Response(JSON.stringify({ 
          error: 'Invite code already used',
          details: 'This invite code has already been used by another member'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if expired
      if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
        return new Response(JSON.stringify({ 
          error: 'Invite code expired',
          details: 'This invite code has expired'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get chama details
      const { data: chama, error: chamaError } = await supabaseClient
        .from('chama')
        .select('*')
        .eq('id', chama_id)
        .maybeSingle();

      if (chamaError || !chama) {
        console.error('Chama lookup failed:', chamaError);
        return new Response(JSON.stringify({ 
          error: 'Chama not found',
          details: 'The chama you are trying to join does not exist'
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify chama is accepting members
      if (chama.status !== 'active') {
        return new Response(JSON.stringify({ 
          error: 'Chama not active',
          details: 'This chama is not currently accepting new members'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for existing membership (prevents duplicates)
      const { data: existingMember, error: memberCheckError } = await supabaseClient
        .from('chama_members')
        .select('*')
        .eq('chama_id', chama_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberCheckError) {
        console.error('Error checking membership:', memberCheckError);
        return new Response(JSON.stringify({ 
          error: 'Database error',
          details: 'Failed to check membership status'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Handle existing memberships
      if (existingMember) {
        if (existingMember.approval_status === 'approved') {
          return new Response(JSON.stringify({ 
            error: 'Already a member',
            details: 'You are already an approved member of this chama'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (existingMember.approval_status === 'pending') {
          return new Response(JSON.stringify({ 
            error: 'Request pending',
            details: 'Your join request is awaiting manager approval'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Reopen rejected/inactive request
        const { data: updatedMember, error: updateError } = await supabaseClient
          .from('chama_members')
          .update({ approval_status: 'pending' })
          .eq('chama_id', chama_id)
          .eq('user_id', user.id)
          .select()
          .maybeSingle();

        if (updateError) {
          console.error('Error updating member status:', updateError);
          return new Response(JSON.stringify({ 
            error: 'Update failed',
            details: 'Failed to resubmit join request'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Mark invite code as used
        await supabaseClient
          .from('chama_invite_codes')
          .update({
            used_by: user.id,
            used_at: new Date().toISOString(),
            is_active: false,
          })
          .eq('id', inviteCode.id);

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Join request submitted successfully',
          data: updatedMember
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get next order_index
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select('order_index')
        .eq('chama_id', chama_id)
        .not('order_index', 'is', null)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrderIndex = members && members.length > 0 
        ? (members[0].order_index || 0) + 1 
        : 2;

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
        .maybeSingle();

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
          is_active: false,
        })
        .eq('id', inviteCode.id);

      console.log('New member created:', newMember);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Join request submitted successfully',
        data: newMember 
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /chama-join - Approve or reject join requests
    if (req.method === 'PUT') {
      const body = await req.json();
      const { member_id, approved, action } = body;

      // Support both member_id and action parameters
      const memberId = member_id;
      const isApproved = approved !== undefined ? approved : action === 'approve';

      if (!memberId) {
        return new Response(JSON.stringify({ 
          error: 'Missing member_id',
          details: 'member_id is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!isValidUUID(memberId)) {
        return new Response(JSON.stringify({ 
          error: 'Invalid member ID format',
          details: 'member_id must be a valid UUID'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Approval request:', { memberId, approved: isApproved });

      // Get member details
      const { data: member, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('*, chama!inner(*)')
        .eq('id', memberId)
        .maybeSingle();

      if (memberError || !member) {
        console.error('Member lookup failed:', memberError);
        return new Response(JSON.stringify({ 
          error: 'Member not found',
          details: 'The member you are trying to approve does not exist'
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify requester has manager permissions
      const { data: requesterMember, error: requesterError } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', member.chama_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (requesterError || !requesterMember?.is_manager) {
        console.error('Manager check failed:', requesterError);
        return new Response(JSON.stringify({ 
          error: 'Access denied',
          details: 'Only chama managers can approve join requests'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update membership status
      const { data: updatedMember, error: updateError } = await supabaseClient
        .from('chama_members')
        .update({
          approval_status: isApproved ? 'approved' : 'rejected',
          status: isApproved ? 'active' : 'inactive',
        })
        .eq('id', memberId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Update failed:', updateError);
        throw updateError;
      }

      console.log('Member status updated:', updatedMember);

      return new Response(JSON.stringify({ 
        success: true,
        message: `Member ${isApproved ? 'approved' : 'rejected'} successfully`,
        data: updatedMember 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /chama-join - Get pending join requests (manager only)
    if (req.method === 'GET') {
      // Try to get chama_id from body first, then URL query params, then path
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
        // No body, that's ok
      }
      
      const url = new URL(req.url);
      const pathname = url.pathname;
      const parts = pathname.split('/').filter(Boolean); // [ 'chama-join', 'pending', ':id' ]

      // Support body { action: "pending", chama_id: "..." }, query param (?chama_id=...), or REST path
      let chama_id = (body as any).chama_id || url.searchParams.get('chama_id');
      if (!chama_id && parts.length >= 3 && parts[1] === 'pending') {
        chama_id = parts[2];
      }

      console.log('Fetching pending requests', { pathname, parts, chama_id_present: !!chama_id, hasBody: Object.keys(body).length > 0 });

      if (!chama_id) {
        return new Response(JSON.stringify({ 
          error: 'Missing chama_id',
          details: 'Provide ?chama_id=... or call /chama-join/pending/:id'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!isValidUUID(chama_id)) {
        return new Response(JSON.stringify({ 
          error: 'Invalid chama ID format',
          details: 'chama_id must be a valid UUID'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify requester has manager permissions
      const { data: requesterMember, error: requesterError } = await supabaseClient
        .from('chama_members')
        .select('is_manager')
        .eq('chama_id', chama_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (requesterError || !requesterMember?.is_manager) {
        return new Response(JSON.stringify({ 
          error: 'Access denied',
          details: 'Only chama managers can view pending requests'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch pending join requests
      const { data: pendingMembers, error: pendingError } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles!chama_members_user_id_fkey (
            full_name,
            email,
            phone
          )
        `)
        .eq('chama_id', chama_id)
        .eq('approval_status', 'pending')
        .order('joined_at', { ascending: true });

      if (pendingError) {
        console.error('Failed to fetch pending members:', pendingError);
        throw pendingError;
      }

      return new Response(JSON.stringify({ 
        success: true,
        data: pendingMembers 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Method not allowed',
      details: 'Only GET, POST, and PUT methods are supported'
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in chama-join:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ 
      error: safeMessage,
      code: 'CHAMA_JOIN_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
