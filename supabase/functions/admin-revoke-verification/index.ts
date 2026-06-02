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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roles || []).some((r: { role: string }) => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { user_id, reason } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('id, full_name, phone, is_verified')
      .eq('id', user_id)
      .maybeSingle();
    if (!target) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!target.is_verified) {
      return new Response(JSON.stringify({ error: 'User is not currently verified' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Revoke
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ is_verified: false, verified_at: null })
      .eq('id', user_id);
    if (updErr) throw updErr;

    // Mark any approved verification request as revoked for the audit trail
    await supabase
      .from('user_verification_requests')
      .update({ status: 'revoked', rejection_reason: reason || 'Revoked by admin', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .eq('status', 'approved');

    // In-app + push notification (DB trigger handles push)
    await supabase.from('notifications').insert({
      user_id,
      title: 'Account verification revoked',
      message: reason
        ? `Your verified status was removed. Reason: ${reason}.`
        : 'Your verified status was removed by an administrator.',
      type: 'warning',
      category: 'verification',
    });

    // SMS
    if (target.phone) {
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          },
          body: JSON.stringify({
            phone: target.phone,
            message: `PAMOJA NOVA: Your account verified status has been removed.${reason ? ` Reason: ${reason}.` : ''} Contact support for details.`,
            eventType: 'verification_revoked',
          }),
        });
      } catch (smsErr) {
        console.warn('admin-revoke-verification: SMS failed (non-fatal):', smsErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('admin-revoke-verification error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
