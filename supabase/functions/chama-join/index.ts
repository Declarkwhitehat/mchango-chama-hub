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

// Generate a unique member code: {4-char chama code}{4-char unique suffix}
// Format: ACT5MOO1 where ACT5 = chama code, MOO1 = member suffix
const generateMemberCode = async (client: any, chamaId: string, maxRetries = 10): Promise<string> => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars like 0,O,I,1
  
  // Get chama's group code
  const { data: chama } = await client
    .from('chama')
    .select('group_code')
    .eq('id', chamaId)
    .single();
  
  const groupCode = chama?.group_code || 'TEMP';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let memberSuffix = '';
    for (let i = 0; i < 4; i++) {
      memberSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const fullCode = groupCode + memberSuffix;
    
    // Check if code already exists in this chama
    const { data: existing } = await client
      .from('chama_members')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('member_code', fullCode)
      .maybeSingle();
    
    if (!existing) {
      return fullCode;
    }
    console.log(`Member code collision on attempt ${attempt + 1}, retrying...`);
  }
  
  // Fallback: use timestamp-based suffix
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return groupCode + timestamp;
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

    // Admin client to bypass RLS for lookups (chama may be in pending status)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
        // IMPORTANT: Keep status as 'inactive' until first payment is made
        const { data: updatedMember, error: updateError } = await supabaseClient
          .from('chama_members')
          .update({
            approval_status: isApproved ? 'approved' : 'rejected',
            // Keep status inactive - member becomes active only after first payment
            status: isApproved ? 'inactive' : 'inactive',
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

      // Get chama details using admin client to bypass RLS (chama may be pending)
      const { data: chama, error: chamaError } = await adminClient
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

      // Only allow joining chamas that are 'pending' (not started yet)
      // Once a chama is 'active' (started), no new members can join
      if (chama.status === 'active') {
        return new Response(JSON.stringify({ 
          error: 'Chama already started',
          details: 'This chama has already started and is no longer accepting new members. New members can only join before the chama starts.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (chama.status === 'completed' || chama.status === 'deleted' || chama.status === 'cycle_complete') {
        return new Response(JSON.stringify({ 
          error: 'Chama not accepting members',
          details: 'This chama is no longer accepting new members'
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
        
        // Reopen rejected/inactive request using admin client to bypass RLS
        const { data: updatedMember, error: updateError } = await adminClient
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

        // Mark invite code as used using admin client
        await adminClient
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

      // Get the next available order_index for this chama
      const { data: highestOrderMember } = await adminClient
        .from('chama_members')
        .select('order_index')
        .eq('chama_id', chama_id)
        .not('order_index', 'is', null)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const nextOrderIndex = (highestOrderMember?.order_index || 0) + 1;
      console.log('Assigning order_index:', nextOrderIndex);
      
      // Generate a unique member code
      const memberCode = await generateMemberCode(adminClient, chama_id);
      console.log('Generated member code:', memberCode);
      
      // Create pending membership WITH order_index using admin client to bypass RLS
      const { data: newMember, error: memberError } = await adminClient
        .from('chama_members')
        .insert({
          chama_id: chama_id,
          user_id: user.id,
          member_code: memberCode, // Generated unique code
          order_index: nextOrderIndex, // Assigned at join time per user preference
          is_manager: false,
          status: 'inactive', // Inactive until first payment
          approval_status: 'pending',
          first_payment_completed: false,
        })
        .select()
        .maybeSingle();

      if (memberError) {
        console.error('Error creating member:', memberError, { code: memberError.code, details: memberError.details });
        throw memberError;
      }

      // Mark invite code as used using admin client
      await adminClient
        .from('chama_invite_codes')
        .update({
          used_by: user.id,
          used_at: new Date().toISOString(),
          is_active: false,
        })
        .eq('id', inviteCode.id);

      console.log('New member created:', newMember);

      // Get the requester's profile for SMS notification
      const { data: requesterProfile } = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      // Notify the chama manager via SMS
      try {
        // Get manager(s) of this chama
        const { data: managers } = await supabaseClient
          .from('chama_members')
          .select('user_id')
          .eq('chama_id', chama_id)
          .eq('is_manager', true);

        if (managers && managers.length > 0) {
          // Get manager profiles with phone numbers
          const managerUserIds = managers.map(m => m.user_id);
          const { data: managerProfiles } = await supabaseClient
            .from('profiles')
            .select('phone, full_name')
            .in('id', managerUserIds);

          if (managerProfiles && managerProfiles.length > 0) {
            const requesterName = requesterProfile?.full_name || 'Someone';
            const chamaName = chama.name;
            
            // Send SMS to each manager
            for (const manager of managerProfiles) {
              if (manager.phone) {
                try {
                  await fetch(
                    `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                      },
                      body: JSON.stringify({
                        phone: manager.phone,
                        message: `New join request for ${chamaName}! ${requesterName} wants to join. Open the app to approve or reject.`,
                        eventType: 'chama_join_request',
                      }),
                    }
                  );
                  console.log(`SMS notification sent to manager: ${manager.full_name}`);
                } catch (smsError) {
                  console.error('Failed to send SMS to manager:', smsError);
                  // Don't fail the join request if SMS fails
                }
              }
            }
          }
        }
      } catch (notifyError) {
        console.error('Error notifying managers:', notifyError);
        // Don't fail the join request if notification fails
      }

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
        // IMPORTANT: Keep status as 'inactive' until first payment is made
        const { data: updatedMember, error: updateError } = await supabaseClient
          .from('chama_members')
          .update({
            approval_status: isApproved ? 'approved' : 'rejected',
            // Keep status inactive - member becomes active only after first payment
            status: isApproved ? 'inactive' : 'inactive',
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
      const url = new URL(req.url);
      const pathname = url.pathname;
      const parts = pathname.split('/').filter(Boolean); // [ 'chama-join', 'pending', ':id' ]

      // Support both query param (?chama_id=...) and REST path (/chama-join/pending/:id)
      let chama_id = url.searchParams.get('chama_id');
      if (!chama_id && parts.length >= 3 && parts[1] === 'pending') {
        chama_id = parts[2];
      }

      console.log('Fetching pending requests', { pathname, parts, chama_id_present: !!chama_id });

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

      // Fetch pending join requests using admin client to avoid RLS duplicate rows
      const { data: pendingMembers, error: pendingError } = await adminClient
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
