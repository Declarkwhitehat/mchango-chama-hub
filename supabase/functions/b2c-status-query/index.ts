import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

async function getMpesaAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? '';
  const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? '';
  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  
  const response = await fetch(
    'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const data = await response.json();
  if (!data?.access_token) throw new Error('Failed to get M-Pesa access token');
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Verify user
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { withdrawal_id } = body;

    if (!withdrawal_id) {
      return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the withdrawal
    const { data: withdrawal, error: wdError } = await supabaseAdmin
      .from('withdrawals')
      .select('*, profiles:requested_by(phone)')
      .eq('id', withdrawal_id)
      .single();

    if (wdError || !withdrawal) {
      return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow the requester to check their own withdrawal
    if (withdrawal.requested_by !== userData.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Already completed or failed — just return current status
    if (withdrawal.status === 'completed' || withdrawal.status === 'failed') {
      return new Response(JSON.stringify({
        status: withdrawal.status,
        message: `Withdrawal is already ${withdrawal.status}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only query Safaricom for "processing" withdrawals
    if (withdrawal.status !== 'processing') {
      return new Response(JSON.stringify({
        status: withdrawal.status,
        message: 'Withdrawal is not in processing state',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Extract ConversationID from notes
    const notesMatch = (withdrawal.notes || '').match(/ConvID=([^,\s]+)/);
    const conversationId = notesMatch?.[1];

    if (!conversationId) {
      return new Response(JSON.stringify({
        error: 'No ConversationID found for this withdrawal — cannot query Safaricom',
        status: withdrawal.status,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Query Safaricom Transaction Status API
    const accessToken = await getMpesaAccessToken();
    const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? '';
    const initiatorName = Deno.env.get('MPESA_B2C_INITIATOR_NAME') ?? '';
    const securityCredential = Deno.env.get('MPESA_B2C_SECURITY_CREDENTIAL') ?? '';

    const statusPayload = {
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'TransactionStatusQuery',
      TransactionID: conversationId,
      PartyA: shortcode,
      IdentifierType: '4',
      ResultURL: `${supabaseUrl}/functions/v1/b2c-callback`,
      QueueTimeOutURL: `${supabaseUrl}/functions/v1/b2c-callback`,
      Remarks: `Status check for WD-${withdrawal_id.substring(0, 8)}`,
      Occasion: `WD-${withdrawal_id}`,
    };

    console.log('Querying transaction status:', { conversationId, withdrawal_id });

    const statusResponse = await fetch(
      'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusPayload),
      }
    );

    const statusResult = await statusResponse.json();
    console.log('Transaction status response:', statusResult);

    // Update notes with query attempt
    await supabaseAdmin
      .from('withdrawals')
      .update({
        notes: (withdrawal.notes || '') + `\n[SYSTEM] Status query at ${new Date().toISOString()}: ${JSON.stringify(statusResult).substring(0, 200)}`
      })
      .eq('id', withdrawal_id);

    return new Response(JSON.stringify({
      status: withdrawal.status,
      safaricom_response: statusResult,
      message: 'Status query sent. The result will arrive via callback and update the withdrawal automatically.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error in b2c-status-query:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
