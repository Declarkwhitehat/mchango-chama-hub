import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sendSMS(phone: string, message: string) {
  const onfonApiKey = Deno.env.get('ONFON_API_KEY');
  const onfonClientId = Deno.env.get('ONFON_CLIENT_ID');
  const onfonAccessKey = Deno.env.get('ONFON_ACCESS_KEY');
  const onfonSenderId = Deno.env.get('ONFON_SENDER_ID') || 'OnfonInfo';

  if (!onfonApiKey || !onfonClientId || !onfonAccessKey) {
    console.error('Onfon SMS credentials not configured');
    return { success: false, error: 'SMS not configured' };
  }

  let normalizedPhone = phone.replace(/^\+/, '').replace(/\s|-/g, '');
  if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.substring(1);
  else if (!normalizedPhone.startsWith('254')) normalizedPhone = '254' + normalizedPhone.slice(-9);

  try {
    const response = await fetch('https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accesskey': onfonAccessKey },
      body: JSON.stringify({
        ApiKey: onfonApiKey,
        ClientId: onfonClientId,
        SenderId: onfonSenderId,
        MessageParameters: [{ Number: normalizedPhone, Text: message }],
      }),
    });
    const data = await response.json();
    console.log('Payout SMS response:', JSON.stringify(data));
    return { success: response.ok, data };
  } catch (error) {
    console.error('Payout SMS error:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

function kenyaStamp(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.json().catch(() => ({}));
    const withdrawalId: string | undefined = body?.withdrawal_id;
    if (!withdrawalId) {
      return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: wd, error: wdErr } = await supabase
      .from('withdrawals')
      .select('id, status, amount, net_amount, payment_reference, completed_at, requested_by, payment_method_id, metadata, chama_id, mchango_id, organization_id, welfare_id')
      .eq('id', withdrawalId)
      .maybeSingle();

    if (wdErr || !wd) {
      return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (wd.status !== 'completed') {
      return new Response(JSON.stringify({ skipped: 'not_completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const meta = (wd.metadata || {}) as Record<string, unknown>;
    if (meta.payout_sms_sent_at || meta.debt_sms_sent_at) {
      return new Response(JSON.stringify({ skipped: 'already_sent' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve source entity
    let sourceType = 'group';
    let sourceName = 'your group';
    if (wd.chama_id) {
      sourceType = 'chama';
      const { data } = await supabase.from('chama').select('name').eq('id', wd.chama_id).maybeSingle();
      sourceName = data?.name || 'your chama';
    } else if (wd.welfare_id) {
      sourceType = 'welfare';
      const { data } = await supabase.from('welfares').select('name').eq('id', wd.welfare_id).maybeSingle();
      sourceName = data?.name || 'your welfare';
    } else if (wd.mchango_id) {
      sourceType = 'campaign';
      const { data } = await supabase.from('mchango').select('title').eq('id', wd.mchango_id).maybeSingle();
      sourceName = data?.title || 'your campaign';
    } else if (wd.organization_id) {
      sourceType = 'organization';
      const { data } = await supabase.from('organizations').select('name').eq('id', wd.organization_id).maybeSingle();
      sourceName = data?.name || 'your organization';
    }

    // Resolve recipient phone
    let phone = '';
    if (wd.requested_by) {
      const { data: prof } = await supabase.from('profiles').select('phone').eq('id', wd.requested_by).maybeSingle();
      phone = prof?.phone || '';
    }
    if (!phone && wd.payment_method_id) {
      const { data: pm } = await supabase
        .from('payment_methods').select('account_number, phone_number').eq('id', wd.payment_method_id).maybeSingle();
      phone = (pm as any)?.phone_number || (pm as any)?.account_number || '';
    }

    const amount = Number(wd.net_amount ?? wd.amount ?? 0);
    const receipt = wd.payment_reference || wd.id.slice(0, 8).toUpperCase();
    const message = `Confirmed. You have received KES ${amount.toFixed(2)} from ${sourceName} ${sourceType} on ${kenyaStamp(wd.completed_at)}. Receipt: ${receipt}.`;

    let smsResult: unknown = { success: false, error: 'no_phone' };
    if (phone) smsResult = await sendSMS(phone, message);

    // In-app notification as a second channel
    if (wd.requested_by) {
      await supabase.from('notifications').insert({
        user_id: wd.requested_by,
        title: 'Payout received',
        message,
        type: 'success',
        category: 'payment',
        related_entity_id: wd.chama_id || wd.welfare_id || wd.mchango_id || wd.organization_id || null,
        related_entity_type: sourceType,
      });
    }

    await supabase
      .from('withdrawals')
      .update({ metadata: { ...meta, payout_sms_sent_at: new Date().toISOString() } })
      .eq('id', wd.id);

    return new Response(JSON.stringify({ success: true, phone_present: Boolean(phone), smsResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('payout-receipt-sms error:', (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
