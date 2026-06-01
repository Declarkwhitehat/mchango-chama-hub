import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { createNotification, notifyAllAdmins, NotificationTemplates } from "../_shared/notifications.ts";

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

    const body = await req.json();
    const { selfie_path, phone_number } = body;
    if (!selfie_path || !phone_number) {
      return new Response(JSON.stringify({ error: 'selfie_path and phone_number are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Already verified?
    const { data: profile } = await supabase.from('profiles').select('is_verified').eq('id', user.id).maybeSingle();
    if (profile?.is_verified) {
      return new Response(JSON.stringify({ error: 'Account already verified' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Existing pending?
    const { data: existing } = await supabase.from('user_verification_requests')
      .select('id,status,payment_status').eq('user_id', user.id)
      .in('status', ['pending']).maybeSingle();
    if (existing && existing.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'A verification request is already under review' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fee
    const { data: feeSetting } = await supabase.from('platform_settings').select('setting_value').eq('setting_key', 'user_verification_fee').maybeSingle();
    const fee = (feeSetting?.setting_value as any)?.amount ?? 1500;

    // Insert request (or reuse existing pending unpaid one)
    let reqId: string;
    if (existing) {
      reqId = existing.id;
      await supabase.from('user_verification_requests').update({ selfie_path, fee_amount: fee }).eq('id', reqId);
    } else {
      const { data: ins, error: insErr } = await supabase.from('user_verification_requests').insert({
        user_id: user.id, selfie_path, fee_amount: fee, payment_status: 'pending', status: 'pending',
      }).select('id').single();
      if (insErr) throw insErr;
      reqId = ins.id;
    }

    // Trigger STK push
    const accountRef = `ACCV${reqId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const stkRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-stk-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        phone_number,
        amount: fee,
        account_reference: accountRef,
        transaction_desc: 'Account Verify',
      }),
    });
    const stkData = await stkRes.json();
    const checkoutId = stkData?.CheckoutRequestID || stkData?.checkout_request_id;
    if (!stkRes.ok || !checkoutId) {
      return new Response(JSON.stringify({ error: stkData?.error || 'Failed to initiate STK push' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('user_verification_requests').update({
      payment_reference: checkoutId,
    }).eq('id', reqId);

    // Fire-and-forget notifications: confirm to user + alert admins
    try {
      const { data: profileInfo } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .maybeSingle();
      const requesterLabel = profileInfo?.full_name || profileInfo?.phone || 'a user';

      await Promise.allSettled([
        createNotification(supabase, {
          userId: user.id,
          ...NotificationTemplates.verificationRequested('account', requesterLabel),
          relatedEntityId: reqId,
          relatedEntityType: 'user_verification_request',
        }),
        notifyAllAdmins(supabase, {
          ...NotificationTemplates.adminVerificationPending('account', requesterLabel, requesterLabel),
          relatedEntityId: reqId,
          relatedEntityType: 'user_verification_request',
        }),
      ]);
    } catch (notifErr) {
      console.warn('request-account-verification: notifications failed (non-fatal):', notifErr);
    }

    return new Response(JSON.stringify({ success: true, request_id: reqId, checkout_request_id: checkoutId, fee_amount: fee }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('request-account-verification error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
