import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface B2CPayoutRequest {
  withdrawal_id: string;
  phone_number: string;
  amount: number;
}

async function getMpesaAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY');
  const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');

  if (!consumerKey || !consumerSecret) {
    throw new Error('M-Pesa credentials not configured');
  }

  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  
  const response = await fetch(
    'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get M-Pesa access token:', errorText);
    throw new Error('Failed to authenticate with M-Pesa');
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role for internal operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: B2CPayoutRequest = await req.json();
    const { withdrawal_id, phone_number, amount } = body;

    console.log('Processing B2C payout:', { withdrawal_id, phone_number, amount });

    if (!withdrawal_id || !phone_number || !amount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate withdrawal exists and is in approved status
    const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawal_id)
      .single();

    if (withdrawalError || !withdrawal) {
      console.error('Withdrawal not found:', withdrawalError);
      return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (withdrawal.status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Withdrawal must be approved first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format phone number for M-Pesa (ensure 254 format)
    let formattedPhone = phone_number.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('254')) {
      formattedPhone = '254' + formattedPhone;
    }

    // Get M-Pesa B2C credentials
    const initiatorName = Deno.env.get('MPESA_B2C_INITIATOR_NAME');
    const securityCredential = Deno.env.get('MPESA_B2C_SECURITY_CREDENTIAL');
    const shortcode = Deno.env.get('MPESA_SHORTCODE');
    // IMPORTANT: Use SUPABASE_URL for callback URL, not frontend VITE_APP_URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    console.log('B2C credentials check:', {
      hasInitiator: !!initiatorName,
      hasSecurityCredential: !!securityCredential,
      hasShortcode: !!shortcode,
      hasCallbackUrl: !!supabaseUrl
    });

    if (!initiatorName || !securityCredential || !shortcode) {
      console.error('M-Pesa B2C credentials not configured');
      
      // Update withdrawal status to failed
      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'failed',
          notes: (withdrawal.notes || '') + '\n[SYSTEM] B2C credentials not configured'
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({ error: 'M-Pesa B2C not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get access token
    const accessToken = await getMpesaAccessToken();

    // Generate unique conversation ID
    const conversationId = `WD${withdrawal_id.substring(0, 8)}${Date.now()}`;

    // Update B2C attempt tracking before making request
    await supabaseAdmin
      .from('withdrawals')
      .update({
        b2c_attempt_count: (withdrawal.b2c_attempt_count || 0) + 1,
        last_b2c_attempt_at: new Date().toISOString()
      })
      .eq('id', withdrawal_id);

    // Make B2C payment request
    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'BusinessPayment',
      Amount: Math.floor(amount), // M-Pesa B2C requires whole numbers
      PartyA: shortcode,
      PartyB: formattedPhone,
      Remarks: `Withdrawal ${withdrawal_id.substring(0, 8)}`,
      QueueTimeOutURL: `${supabaseUrl}/functions/v1/mpesa-b2c-callback`,
      ResultURL: `${supabaseUrl}/functions/v1/mpesa-b2c-callback`,
      Occasion: conversationId
    };

    console.log('Sending B2C request:', { ...b2cPayload, SecurityCredential: '[REDACTED]' });

    const b2cResponse = await fetch(
      'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(b2cPayload),
      }
    );

    // Handle non-OK responses with detailed logging
    if (!b2cResponse.ok) {
      const errorText = await b2cResponse.text();
      console.error('M-Pesa B2C API HTTP error:', {
        status: b2cResponse.status,
        statusText: b2cResponse.statusText,
        body: errorText
      });

      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'failed',
          b2c_error_details: `HTTP ${b2cResponse.status}: ${errorText}`,
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C API HTTP error: ${b2cResponse.status}`
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({
        success: false,
        error: `M-Pesa API returned HTTP ${b2cResponse.status}`,
        details: errorText
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const b2cResult = await b2cResponse.json();
    console.log('B2C response:', b2cResult);

    if (b2cResult.ResponseCode === '0') {
      // Update withdrawal with pending B2C status
      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'processing',
          payment_reference: b2cResult.ConversationID,
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C initiated: ${b2cResult.ConversationID}`
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({
        success: true,
        message: 'B2C payment initiated',
        conversation_id: b2cResult.ConversationID,
        originator_conversation_id: b2cResult.OriginatorConversationID
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // B2C request failed
      console.error('B2C request failed:', b2cResult);

      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'failed',
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C failed: ${b2cResult.ResponseDescription || 'Unknown error'}`
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({
        success: false,
        error: b2cResult.ResponseDescription || 'B2C request failed',
        error_code: b2cResult.ResponseCode
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: any) {
    console.error('Error in mpesa-b2c-payout:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
