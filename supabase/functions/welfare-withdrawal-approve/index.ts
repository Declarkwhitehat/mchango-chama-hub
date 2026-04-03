import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import { createNotification } from "../_shared/notifications.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const user = userData.user;

    if (req.method === 'POST') {
      const body = await req.json();
      
      // Handle admin cancel during cooling-off period
      if (body.action === 'cancel_cooling_off') {
        const { withdrawal_id } = body;
        if (!withdrawal_id) {
          return new Response(JSON.stringify({ error: 'withdrawal_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Check if user is admin
        const { data: adminRole } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!adminRole) {
          return new Response(JSON.stringify({ error: 'Only admin can cancel during cooling-off period' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { data: withdrawal } = await supabaseAdmin
          .from('withdrawals')
          .select('id, status, cooling_off_until, welfare_id, amount, requested_by')
          .eq('id', withdrawal_id)
          .single();

        if (!withdrawal) {
          return new Response(JSON.stringify({ error: 'Withdrawal not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (withdrawal.status !== 'approved' || !withdrawal.cooling_off_until) {
          return new Response(JSON.stringify({ error: 'Withdrawal is not in cooling-off period' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'rejected',
            rejection_reason: 'Cancelled by admin during 24-hour cooling-off period',
            reviewed_at: new Date().toISOString(),
            cooling_off_until: null,
          })
          .eq('id', withdrawal_id);

        // Notify requester
        if (withdrawal.requested_by) {
          await createNotification(supabaseAdmin, {
            user_id: withdrawal.requested_by,
            title: 'Withdrawal Cancelled',
            message: `Your withdrawal of KES ${Number(withdrawal.amount).toLocaleString()} was cancelled by admin during the cooling-off period.`,
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: withdrawal.welfare_id,
          });
        }

        return new Response(JSON.stringify({ status: 'cancelled', message: 'Withdrawal cancelled during cooling-off period' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { approval_id, decision, rejection_reason } = body;

      if (!approval_id || !decision) {
        return new Response(JSON.stringify({ error: 'approval_id and decision required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!['approved', 'rejected'].includes(decision)) {
        return new Response(JSON.stringify({ error: 'Decision must be approved or rejected' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get the approval record
      const { data: approval } = await supabaseAdmin
        .from('welfare_withdrawal_approvals')
        .select('*, welfare_members!approver_id(user_id, role)')
        .eq('id', approval_id)
        .single();

      if (!approval) {
        return new Response(JSON.stringify({ error: 'Approval not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Verify the approver is the correct user
      if (approval.welfare_members.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'You are not authorized to approve this' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (approval.decision !== 'pending') {
        return new Response(JSON.stringify({ error: 'Already decided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Auto-accept expired pending executive changes
      await supabaseAdmin
        .from('welfare_executive_changes')
        .update({ admin_decision: 'auto_accepted', admin_decided_at: new Date().toISOString() })
        .eq('welfare_id', approval.welfare_id)
        .eq('admin_decision', 'pending')
        .lte('cooldown_ends_at', new Date().toISOString());

      // Check for active executive change cooldown
      const { data: activeCooldown } = await supabaseAdmin
        .from('welfare_executive_changes')
        .select('id, cooldown_ends_at, cooldown_hours')
        .eq('welfare_id', approval.welfare_id)
        .eq('admin_decision', 'pending')
        .gt('cooldown_ends_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeCooldown) {
        return new Response(JSON.stringify({ 
          error: `Withdrawals blocked due to executive change. Security cooldown active until ${new Date(activeCooldown.cooldown_ends_at).toLocaleString()}.`,
          cooldown_ends_at: activeCooldown.cooldown_ends_at
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update the approval
      const { error: updateError } = await supabaseAdmin
        .from('welfare_withdrawal_approvals')
        .update({
          decision,
          decided_at: new Date().toISOString(),
          rejection_reason: decision === 'rejected' ? (rejection_reason || null) : null,
        })
        .eq('id', approval_id);

      if (updateError) throw updateError;

      // Check if rejected → immediately reject the withdrawal
      if (decision === 'rejected') {
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'rejected',
            rejection_reason: `Rejected by ${approval.approver_role}: ${rejection_reason || 'No reason given'}`,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', approval.withdrawal_id);

        // Notify requester
        const { data: withdrawal } = await supabaseAdmin
          .from('withdrawals')
          .select('requested_by, amount')
          .eq('id', approval.withdrawal_id)
          .single();

        if (withdrawal) {
          await createNotification(supabaseAdmin, {
            user_id: withdrawal.requested_by,
            title: 'Withdrawal Rejected',
            message: `Your withdrawal of KES ${Number(withdrawal.amount).toLocaleString()} was rejected by the ${approval.approver_role}.`,
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: approval.welfare_id,
          });
        }

        return new Response(JSON.stringify({ status: 'rejected', message: 'Withdrawal rejected' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if both approvers have approved
      const { data: allApprovals } = await supabaseAdmin
        .from('welfare_withdrawal_approvals')
        .select('decision')
        .eq('withdrawal_id', approval.withdrawal_id);

      const allApproved = allApprovals?.every(a => a.decision === 'approved');

      if (allApproved) {
        // Get withdrawal details
        const { data: withdrawal } = await supabaseAdmin
          .from('withdrawals')
          .select('requested_by, amount, net_amount, notes')
          .eq('id', approval.withdrawal_id)
          .single();

        // Set 24-hour cooling-off period instead of immediate B2C
        const coolingOffUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const withdrawalAmount = Number(withdrawal?.amount || 0);
        
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'approved',
            reviewed_at: new Date().toISOString(),
            cooling_off_until: coolingOffUntil,
            notes: (withdrawal?.notes || '') + '\n[SYSTEM] Multi-sig approved by Secretary and Treasurer. 24-hour cooling-off period started.',
          })
          .eq('id', approval.withdrawal_id);

        // Immediately deduct the amount from welfare available_balance
        if (withdrawalAmount > 0) {
          const { data: welfare } = await supabaseAdmin
            .from('welfares')
            .select('available_balance')
            .eq('id', approval.welfare_id)
            .single();

          if (welfare) {
            const newBalance = Math.max(0, Number(welfare.available_balance || 0) - withdrawalAmount);
            await supabaseAdmin
              .from('welfares')
              .update({ available_balance: newBalance })
              .eq('id', approval.welfare_id);
          }
        }

        // Notify requester about approval + cooling-off
        if (withdrawal) {
          await createNotification(supabaseAdmin, {
            user_id: withdrawal.requested_by,
            title: 'Withdrawal Approved — 24hr Hold',
            message: `Your withdrawal of KES ${Number(withdrawal.amount).toLocaleString()} has been approved. Payout will be processed after a 24-hour cooling-off period.`,
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: approval.welfare_id,
          });
        }

        // Notify ALL welfare members about the approved withdrawal
        const { data: allMembers } = await supabaseAdmin
          .from('welfare_members')
          .select('user_id')
          .eq('welfare_id', approval.welfare_id)
          .eq('status', 'active');

        if (allMembers && withdrawal) {
          const phoneMatch = (withdrawal.notes || '').match(/Name:\s*([^)]+)\)/);
          const recipientName = phoneMatch?.[1] || 'a member';
          
          for (const member of allMembers) {
            if (member.user_id !== withdrawal.requested_by) {
              await createNotification(supabaseAdmin, {
                user_id: member.user_id,
                title: 'Welfare Withdrawal Approved',
                message: `A withdrawal of KES ${Number(withdrawal.amount).toLocaleString()} to ${recipientName} has been approved. Payout in 24 hours unless cancelled.`,
                category: 'welfare',
                related_entity_type: 'welfare',
                related_entity_id: approval.welfare_id,
              });
            }
          }
        }

        return new Response(JSON.stringify({ 
          status: 'approved', 
          message: 'Both approvers agreed. Withdrawal approved with 24-hour cooling-off period before payout.',
          cooling_off_until: coolingOffUntil,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ status: 'pending', message: 'Your approval recorded. Waiting for the other approver.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET - List pending approvals for current user
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const welfareId = url.searchParams.get('welfare_id');

      // Get user's member IDs
      const memberQuery = supabaseAdmin
        .from('welfare_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (welfareId) memberQuery.eq('welfare_id', welfareId);

      const { data: members } = await memberQuery;
      const memberIds = members?.map(m => m.id) || [];

      if (memberIds.length === 0) {
        return new Response(JSON.stringify({ data: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await supabaseAdmin
        .from('welfare_withdrawal_approvals')
        .select('*, withdrawals!withdrawal_id(amount, net_amount, status, notes, requested_at, requested_by), welfares!welfare_id(name)')
        .in('approver_id', memberIds)
        .eq('decision', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Separately look up requester profiles
      const requesterIds = [...new Set((data || []).map((a: any) => a.withdrawals?.requested_by).filter(Boolean))];
      let profilesMap: Record<string, any> = {};
      if (requesterIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', requesterIds);
        for (const p of (profiles || [])) {
          profilesMap[p.id] = p;
        }
      }

      // Attach profile info to each approval
      const enriched = (data || []).map((a: any) => ({
        ...a,
        withdrawals: {
          ...a.withdrawals,
          profiles: profilesMap[a.withdrawals?.requested_by] || null,
        },
      }));

      return new Response(JSON.stringify({ data: enriched }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-withdrawal-approve error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
