import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

// Helper: Record executive change, cancel pending withdrawals, notify all members
async function handleExecutiveChange(
  supabaseAdmin: any,
  welfareId: string,
  changeType: string,
  oldRole: string | null,
  newRole: string | null,
  affectedMemberId: string | null,
  affectedUserName: string | null,
  newMemberId: string | null,
  newUserName: string | null,
  changedBy: string
) {
  const isExecutiveRole = (r: string | null) => r && ['chairman', 'secretary', 'treasurer'].includes(r);
  
  // Only trigger cooldown for executive role changes
  if (!isExecutiveRole(oldRole) && !isExecutiveRole(newRole)) return;

  // Determine cooldown: 96h if pending withdrawals exist, 72h otherwise
  const { data: pendingWithdrawals } = await supabaseAdmin
    .from('withdrawals')
    .select('id')
    .eq('welfare_id', welfareId)
    .in('status', ['pending_approval', 'pending', 'approved'])
    .limit(100);

  const hasPendingWithdrawals = (pendingWithdrawals?.length || 0) > 0;
  const cooldownHours = hasPendingWithdrawals ? 96 : 72;
  const cooldownEndsAt = new Date(Date.now() + cooldownHours * 60 * 60 * 1000).toISOString();

  // Cancel all pending/approved withdrawals
  let cancelledCount = 0;
  if (hasPendingWithdrawals) {
    const withdrawalIds = pendingWithdrawals!.map((w: any) => w.id);
    
    const { count } = await supabaseAdmin
      .from('withdrawals')
      .update({
        status: 'rejected',
        rejection_reason: `Auto-cancelled: Executive role change detected (${oldRole || 'none'} → ${newRole || 'removed'}). Security cooldown active.`,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', withdrawalIds)
      .in('status', ['pending_approval', 'pending', 'approved']);

    cancelledCount = count || withdrawalIds.length;

    // Also cancel related welfare_withdrawal_approvals
    await supabaseAdmin
      .from('welfare_withdrawal_approvals')
      .update({ decision: 'rejected', decided_at: new Date().toISOString(), rejection_reason: 'Auto-cancelled due to executive change' })
      .in('withdrawal_id', withdrawalIds)
      .eq('decision', 'pending');
  }

  // Record the change
  await supabaseAdmin
    .from('welfare_executive_changes')
    .insert({
      welfare_id: welfareId,
      change_type: changeType,
      old_role: oldRole,
      new_role: newRole,
      affected_member_id: affectedMemberId,
      affected_user_name: affectedUserName,
      new_member_id: newMemberId,
      new_user_name: newUserName,
      changed_by: changedBy,
      cooldown_hours: cooldownHours,
      cooldown_ends_at: cooldownEndsAt,
      pending_withdrawals_cancelled: cancelledCount,
    });

  // Notify ALL active members
  const { data: allMembers } = await supabaseAdmin
    .from('welfare_members')
    .select('user_id')
    .eq('welfare_id', welfareId)
    .eq('status', 'active');

  const { data: welfareInfo } = await supabaseAdmin
    .from('welfares')
    .select('name')
    .eq('id', welfareId)
    .single();

  const welfareName = welfareInfo?.name || 'Welfare';
  const changeDesc = changeType === 'member_removed'
    ? `${affectedUserName || 'A member'} (${oldRole}) has been removed`
    : `${oldRole || 'member'} role changed to ${newRole}${newUserName ? ` (${newUserName})` : ''}`;

  if (allMembers) {
    const notifications = allMembers.map((m: any) => ({
      user_id: m.user_id,
      title: `⚠️ Executive Change in ${welfareName}`,
      message: `${changeDesc}. Withdrawals are blocked for ${cooldownHours} hours for security. ${cancelledCount > 0 ? `${cancelledCount} pending withdrawal(s) were cancelled.` : ''} If suspicious, contact customer care immediately.`,
      category: 'welfare',
      type: 'warning',
      related_entity_type: 'welfare',
      related_entity_id: welfareId,
    }));

    // Insert in batches of 50
    for (let i = 0; i < notifications.length; i += 50) {
      await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + 50));
    }
  }

  console.log(`Executive change recorded for welfare ${welfareId}: ${changeDesc}. Cooldown: ${cooldownHours}h, Cancelled: ${cancelledCount}`);
}

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

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const user = userData.user;

    // POST - Join welfare by group_code
    if (req.method === 'POST') {
      const body = await req.json();
      const { welfare_id, group_code } = body;

      let targetWelfareId = welfare_id;

      if (group_code && !welfare_id) {
        const { data: welfare } = await supabaseAdmin
          .from('welfares')
          .select('id, status')
          .eq('group_code', group_code.toUpperCase())
          .eq('status', 'active')
          .single();

        if (!welfare) {
          return new Response(JSON.stringify({ error: 'Welfare not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        targetWelfareId = welfare.id;
      }

      if (!targetWelfareId) {
        return new Response(JSON.stringify({ error: 'welfare_id or group_code required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: existing } = await supabaseAdmin
        .from('welfare_members')
        .select('id, status')
        .eq('welfare_id', targetWelfareId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing && existing.status === 'active') {
        return new Response(JSON.stringify({ error: 'Already a member' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await supabaseAdmin
        .from('welfare_members')
        .insert({ welfare_id: targetWelfareId, user_id: user.id, role: 'member', status: 'active' })
        .select('*, profiles:user_id(full_name, phone)')
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // PUT - Assign roles (Chairman or Admin)
    if (req.method === 'PUT') {
      const body = await req.json();
      const { member_id, role, admin_action } = body;

      if (!member_id || !role) {
        return new Response(JSON.stringify({ error: 'member_id and role required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: adminRole } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      const isAdmin = !!adminRole;

      const allowedRoles = isAdmin 
        ? ['chairman', 'secretary', 'treasurer', 'member']
        : ['secretary', 'treasurer', 'member'];

      if (!allowedRoles.includes(role)) {
        return new Response(JSON.stringify({ error: `Invalid role. Use: ${allowedRoles.join(', ')}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: targetMember } = await supabaseAdmin
        .from('welfare_members')
        .select('welfare_id, role, user_id, profiles:user_id(full_name)')
        .eq('id', member_id)
        .single();

      if (!targetMember) {
        return new Response(JSON.stringify({ error: 'Member not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!isAdmin) {
        const { data: requesterMember } = await supabaseAdmin
          .from('welfare_members')
          .select('role')
          .eq('welfare_id', targetMember.welfare_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (!requesterMember || requesterMember.role !== 'chairman') {
          return new Response(JSON.stringify({ error: 'Only the Chairman or Admin can assign roles' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      const oldRole = targetMember.role;
      const targetName = (targetMember as any).profiles?.full_name || 'Unknown';

      // Track who is being replaced for executive roles
      let replacedMemberName: string | null = null;
      let replacedMemberId: string | null = null;

      if (role === 'chairman') {
        const { data: existing } = await supabaseAdmin
          .from('welfare_members')
          .select('id, profiles:user_id(full_name)')
          .eq('welfare_id', targetMember.welfare_id)
          .eq('role', 'chairman')
          .neq('id', member_id)
          .maybeSingle();

        if (existing) {
          replacedMemberId = existing.id;
          replacedMemberName = (existing as any).profiles?.full_name || 'Unknown';
        }

        await supabaseAdmin
          .from('welfare_members')
          .update({ role: 'member' })
          .eq('welfare_id', targetMember.welfare_id)
          .eq('role', 'chairman')
          .neq('id', member_id);
      }

      if (role === 'secretary' || role === 'treasurer') {
        const { data: existing } = await supabaseAdmin
          .from('welfare_members')
          .select('id, profiles:user_id(full_name)')
          .eq('welfare_id', targetMember.welfare_id)
          .eq('role', role)
          .neq('id', member_id)
          .maybeSingle();

        if (existing) {
          replacedMemberId = existing.id;
          replacedMemberName = (existing as any).profiles?.full_name || 'Unknown';
        }

        await supabaseAdmin
          .from('welfare_members')
          .update({ role: 'member' })
          .eq('welfare_id', targetMember.welfare_id)
          .eq('role', role)
          .neq('id', member_id);
      }

      const { data, error } = await supabaseAdmin
        .from('welfare_members')
        .update({ role })
        .eq('id', member_id)
        .select('*, profiles:user_id(full_name, phone)')
        .single();

      if (error) throw error;

      // Track executive change (non-admin changes trigger cooldown)
      if (!isAdmin) {
        await handleExecutiveChange(
          supabaseAdmin,
          targetMember.welfare_id,
          'role_assigned',
          replacedMemberName ? role : oldRole,
          role,
          replacedMemberId || member_id,
          replacedMemberName || targetName,
          member_id,
          targetName,
          user.id
        );
      }

      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // DELETE - Remove member (Chairman) or leave (self)
    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const memberId = url.searchParams.get('member_id');
      const action = url.searchParams.get('action');

      if (action === 'leave') {
        const welfareId = url.searchParams.get('welfare_id');
        if (!welfareId) {
          return new Response(JSON.stringify({ error: 'welfare_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { data: selfMember } = await supabaseAdmin
          .from('welfare_members')
          .select('id, role, profiles:user_id(full_name)')
          .eq('welfare_id', welfareId)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (!selfMember) {
          return new Response(JSON.stringify({ error: 'You are not a member of this welfare' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (selfMember.role === 'chairman') {
          return new Response(JSON.stringify({ error: 'The Chairman cannot leave. Transfer chairmanship first or dissolve the group.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const isExecutiveLeaving = ['secretary', 'treasurer'].includes(selfMember.role);

        const { error } = await supabaseAdmin
          .from('welfare_members')
          .update({ status: 'left' })
          .eq('id', selfMember.id);

        if (error) throw error;

        // Track if executive is leaving
        if (isExecutiveLeaving) {
          await handleExecutiveChange(
            supabaseAdmin,
            welfareId,
            'member_removed',
            selfMember.role,
            null,
            selfMember.id,
            (selfMember as any).profiles?.full_name || 'Unknown',
            null,
            null,
            user.id
          );
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!memberId) {
        return new Response(JSON.stringify({ error: 'member_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: adminRoleDel } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      const isAdminDel = !!adminRoleDel;

      const { data: targetMember } = await supabaseAdmin
        .from('welfare_members')
        .select('welfare_id, role, user_id, profiles:user_id(full_name)')
        .eq('id', memberId)
        .single();

      if (!targetMember) {
        return new Response(JSON.stringify({ error: 'Member not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (targetMember.role === 'chairman' && !isAdminDel) {
        return new Response(JSON.stringify({ error: 'Cannot remove the Chairman' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!isAdminDel) {
        const { data: requesterMember } = await supabaseAdmin
          .from('welfare_members')
          .select('role')
          .eq('welfare_id', targetMember.welfare_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (!requesterMember || requesterMember.role !== 'chairman') {
          return new Response(JSON.stringify({ error: 'Only the Chairman or Admin can remove members' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      const isExecutiveRemoval = ['chairman', 'secretary', 'treasurer'].includes(targetMember.role);

      const { error } = await supabaseAdmin
        .from('welfare_members')
        .update({ status: 'removed' })
        .eq('id', memberId);

      if (error) throw error;

      // Track executive removal
      if (isExecutiveRemoval && !isAdminDel) {
        await handleExecutiveChange(
          supabaseAdmin,
          targetMember.welfare_id,
          'member_removed',
          targetMember.role,
          null,
          memberId,
          (targetMember as any).profiles?.full_name || 'Unknown',
          null,
          null,
          user.id
        );
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-members error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
