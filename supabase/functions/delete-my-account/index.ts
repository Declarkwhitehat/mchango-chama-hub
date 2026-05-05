import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REQUIRED_PHRASE = 'DELETE MY ACCOUNT';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(401, { error: 'Unauthorized' });
    }
    const token = authHeader.replace('Bearer ', '').trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !callerData?.user) return json(401, { error: 'Unauthorized' });
    const user = callerData.user;
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const { confirm_phrase, password } = body || {};

    if (!confirm_phrase || String(confirm_phrase).trim() !== REQUIRED_PHRASE) {
      return json(400, { error: `Type "${REQUIRED_PHRASE}" exactly to confirm.` });
    }
    if (!password || typeof password !== 'string') {
      return json(400, { error: 'Password is required to confirm deletion.' });
    }

    // Block admins
    const { data: roles } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', userId);
    if ((roles || []).some((r: any) => r.role === 'admin' || r.role === 'super_admin')) {
      return json(403, { error: 'Admin accounts cannot be self-deleted. Contact support.' });
    }

    // Re-verify password using anon client
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseAnon = createClient(supabaseUrl, anonKey);
    if (user.email) {
      const { error: pwErr } = await supabaseAnon.auth.signInWithPassword({
        email: user.email, password,
      });
      if (pwErr) return json(401, { error: 'Incorrect password.' });
    } else {
      return json(400, { error: 'Account has no email; contact support to delete.' });
    }

    // Block if there are pending withdrawals
    const { data: pendingW } = await supabaseAdmin
      .from('withdrawals')
      .select('id')
      .eq('requested_by', userId)
      .in('status', ['pending', 'approved', 'processing', 'pending_retry'])
      .limit(1);
    if (pendingW && pendingW.length > 0) {
      return json(409, { error: 'You have a pending withdrawal. Wait for it to complete before deleting your account.' });
    }

    // Block if user is a manager of any active chama
    const { data: managedChamas } = await supabaseAdmin
      .from('chama_members')
      .select('id, chama_id, chama:chama_id(status)')
      .eq('user_id', userId)
      .eq('is_manager', true)
      .eq('status', 'active')
      .eq('approval_status', 'approved');
    const hasManagedActive = (managedChamas || []).some(
      (m: any) => m.chama && ['active', 'pending'].includes(m.chama.status),
    );
    if (hasManagedActive) {
      return json(409, { error: 'You manage an active chama. Transfer leadership first, then delete your account.' });
    }

    // Soft-delete profile
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('full_name, deleted_at').eq('id', userId).maybeSingle();
    if (!profile) return json(404, { error: 'Profile not found.' });
    if (profile.deleted_at) return json(400, { error: 'Account already scheduled for deletion.' });

    const { error: softErr } = await supabaseAdmin
      .from('profiles')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deletion_reason: 'user_self_deletion',
      })
      .eq('id', userId);
    if (softErr) return json(500, { error: 'Failed to delete account', details: (softErr as any).message });

    // Mark all active chama memberships as left so groups stay clean
    try {
      await supabaseAdmin
        .from('chama_members')
        .update({ status: 'left' })
        .eq('user_id', userId)
        .eq('is_manager', false)
        .in('status', ['active', 'inactive']);
    } catch (_) { /* best-effort */ }

    // Ban auth user (long ban; admin can restore later)
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    } catch (e) {
      console.log('Warning: failed to ban auth user', (e as any).message);
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'SELF_DELETE',
        table_name: 'profiles',
        record_id: userId,
        user_id: userId,
        new_values: { deleted_at: new Date().toISOString(), reason: 'user_self_deletion' },
      });
    } catch (_) { /* ignore */ }

    return json(200, {
      success: true,
      message: 'Your account has been deleted. You have been signed out.',
    });
  } catch (error) {
    console.error('delete-my-account error:', (error as any).message);
    return json(500, { error: (error as any).message || 'Unexpected error' });
  }
});
