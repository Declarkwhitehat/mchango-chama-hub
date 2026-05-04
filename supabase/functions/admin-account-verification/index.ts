import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: { user } } = await supabase.auth.getUser(authHeader);
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // admin?
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roles || []).some(r => r.role === 'admin');
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { request_id, action, rejection_reason } = await req.json();
    if (!request_id || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: vReq } = await supabase.from('user_verification_requests').select('*').eq('id', request_id).maybeSingle();
    if (!vReq) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (action === 'approve') {
      if (vReq.payment_status !== 'paid') {
        return new Response(JSON.stringify({ error: 'Cannot approve unpaid request' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('user_verification_requests').update({
        status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', request_id);
      await supabase.from('profiles').update({
        is_verified: true, verified_at: new Date().toISOString(),
      }).eq('id', vReq.user_id);
      await supabase.from('notifications').insert({
        user_id: vReq.user_id,
        title: '✅ Account Verified',
        message: 'Your account is now verified. Any chama, welfare, organization or campaign you create will be auto-verified.',
        type: 'success', category: 'account',
      });
    } else {
      await supabase.from('user_verification_requests').update({
        status: 'rejected', rejection_reason: rejection_reason || null, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', request_id);
      await supabase.from('notifications').insert({
        user_id: vReq.user_id,
        title: 'Account verification rejected',
        message: rejection_reason ? `Reason: ${rejection_reason}` : 'Your account verification request was rejected.',
        type: 'warning', category: 'account',
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-account-verification error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
