import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STOP_FOOTER = "\nSTOP 4569*5#";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { user_id, action, rejection_reason } = await req.json();
    if (!user_id || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'reject' && !rejection_reason?.trim()) {
      return new Response(JSON.stringify({ error: 'Rejection reason required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', user_id)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const firstName = (profile.full_name || 'there').split(' ')[0];
    const nowIso = new Date().toISOString();

    if (action === 'approve') {
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          kyc_status: 'approved',
          kyc_reviewed_at: nowIso,
          kyc_reviewed_by: user.id,
          kyc_rejection_reason: null,
        })
        .eq('id', user_id);
      if (upErr) throw upErr;

      const title = '✅ Identity Verified';
      const message = 'Your identity verification has been approved. You can now create chamas, welfares, campaigns and organizations.';

      await supabase.from('notifications').insert({
        user_id,
        title,
        message,
        type: 'success',
        category: 'account',
      });

      const sms = `Hi ${firstName}, your identity verification has been approved. You can now create chamas, welfares, campaigns and organizations on the app.${STOP_FOOTER}`;
      if (profile.phone) {
        await supabase.functions.invoke('send-transactional-sms', {
          body: { phone: profile.phone, message: sms, eventType: 'kyc_approved' },
        }).catch((e: unknown) => console.error('SMS send failed', e));
      }

      // Best-effort direct push (notifications row trigger should also fire)
      await supabase.functions.invoke('send-push-notification', {
        body: { user_id, title, body: message, data: { category: 'kyc', status: 'approved' } },
      }).catch((e: unknown) => console.error('Push send failed', e));
    } else {
      const reason = rejection_reason.trim();
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          kyc_status: 'rejected',
          kyc_reviewed_at: nowIso,
          kyc_reviewed_by: user.id,
          kyc_rejection_reason: reason,
        })
        .eq('id', user_id);
      if (upErr) throw upErr;

      const title = '❌ Identity Verification Rejected';
      const message = `Your identity verification was not approved. Reason: ${reason}. Please re-upload your documents.`;

      await supabase.from('notifications').insert({
        user_id,
        title,
        message,
        type: 'warning',
        category: 'account',
      });

      const sms = `Hi ${firstName}, your identity verification was rejected. Reason: ${reason}. Please log in and re-submit your documents.${STOP_FOOTER}`;
      if (profile.phone) {
        await supabase.functions.invoke('send-transactional-sms', {
          body: { phone: profile.phone, message: sms, eventType: 'kyc_rejected' },
        }).catch((e: unknown) => console.error('SMS send failed', e));
      }

      await supabase.functions.invoke('send-push-notification', {
        body: { user_id, title, body: message, data: { category: 'kyc', status: 'rejected' } },
      }).catch((e: unknown) => console.error('Push send failed', e));
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('kyc-review error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
