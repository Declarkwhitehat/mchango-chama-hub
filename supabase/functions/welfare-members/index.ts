import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

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

      // Use supabaseAdmin for insert to bypass RLS and enable FK joins
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
        .select('welfare_id, role')
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

      if (role === 'chairman') {
        await supabaseAdmin
          .from('welfare_members')
          .update({ role: 'member' })
          .eq('welfare_id', targetMember.welfare_id)
          .eq('role', 'chairman')
          .neq('id', member_id);
      }

      if (role === 'secretary' || role === 'treasurer') {
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
          .select('id, role')
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

        const { error } = await supabaseAdmin
          .from('welfare_members')
          .update({ status: 'left' })
          .eq('id', selfMember.id);

        if (error) throw error;
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
        .select('welfare_id, role, user_id')
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

      const { error } = await supabaseAdmin
        .from('welfare_members')
        .update({ status: 'removed' })
        .eq('id', memberId);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-members error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
