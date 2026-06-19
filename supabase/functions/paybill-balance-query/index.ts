import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PRIVILEGE_CODE = "D3E9C0L1A3R9K";

async function getAccessToken(): Promise<string> {
  const key = Deno.env.get('MPESA_CONSUMER_KEY');
  const secret = Deno.env.get('MPESA_CONSUMER_SECRET');
  if (!key || !secret) throw new Error('M-Pesa credentials not configured');
  const auth = btoa(`${key}:${secret}`);
  const r = await fetch('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) throw new Error(`OAuth failed: ${await r.text()}`);
  return (await r.json()).access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: userData } = await supabaseAdmin.auth.getUser(bearer);
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden - super admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.privilege_code !== PRIVILEGE_CODE) {
      return new Response(JSON.stringify({ error: 'Invalid privilege code' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const initiatorName = Deno.env.get('MPESA_B2C_INITIATOR_NAME');
    const securityCredential = Deno.env.get('MPESA_B2C_SECURITY_CREDENTIAL');
    const shortcode = Deno.env.get('MPESA_SHORTCODE');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!initiatorName || !securityCredential || !shortcode) {
      return new Response(JSON.stringify({ error: 'M-Pesa credentials not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getAccessToken();
    const payload = {
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'AccountBalance',
      PartyA: shortcode,
      IdentifierType: '4',
      Remarks: 'Admin balance query',
      QueueTimeOutURL: `${supabaseUrl}/functions/v1/paybill-balance-callback`,
      ResultURL: `${supabaseUrl}/functions/v1/paybill-balance-callback`,
    };

    const r = await fetch('https://api.safaricom.co.ke/mpesa/accountbalance/v1/query', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await r.json().catch(() => ({}));
    console.log('Account balance query response:', result);

    if (!r.ok || result?.ResponseCode !== '0') {
      return new Response(JSON.stringify({ error: 'Daraja request failed', detail: result }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert pending snapshot — callback will update it
    await supabaseAdmin.from('paybill_balance_snapshots').insert({
      shortcode,
      conversation_id: result.ConversationID,
      originator_conversation_id: result.OriginatorConversationID,
      queried_by: userId,
    });

    // Audit super-admin action
    try {
      await supabaseAdmin.from('admin_action_log').insert({
        actor_user_id: userId,
        actor_email: userData?.user?.email ?? null,
        action_key: 'paybill.balance_query',
        target_type: 'shortcode',
        target_id: shortcode,
        metadata: { conversation_id: result.ConversationID },
        ip_address: req.headers.get('x-forwarded-for') || null,
        user_agent: req.headers.get('user-agent') || null,
      });
    } catch (_) { /* best effort */ }

    return new Response(JSON.stringify({
      success: true,
      message: 'Balance request submitted. Result will appear shortly.',
      conversation_id: result.ConversationID,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('paybill-balance-query error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
