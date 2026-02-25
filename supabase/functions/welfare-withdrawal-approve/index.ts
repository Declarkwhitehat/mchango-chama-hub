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
        // Both approved → mark withdrawal as approved for B2C payout
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'approved',
            reviewed_at: new Date().toISOString(),
            notes: 'Multi-sig approved by Secretary and Treasurer',
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
            title: 'Withdrawal Approved',
            message: `Your withdrawal of KES ${Number(withdrawal.amount).toLocaleString()} has been approved and will be processed shortly.`,
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: approval.welfare_id,
          });
        }

        return new Response(JSON.stringify({ status: 'approved', message: 'Both approvers agreed. Withdrawal approved for payout.' }), {
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
        .select('*, withdrawals!withdrawal_id(amount, net_amount, status, notes, requested_at, profiles:requested_by(full_name, phone)), welfares!welfare_id(name)')
        .in('approver_id', memberIds)
        .eq('decision', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-withdrawal-approve error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
