import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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

    // Validate withdrawal exists and is in approved or processing status
    const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
      .from('withdrawals')
      .select('*, chama:chama_id(name), mchango:mchango_id(title), organization:organization_id(name), welfare:welfare_id(name)')
      .eq('id', withdrawal_id)
      .single();

    if (withdrawalError || !withdrawal) {
      console.error('Withdrawal not found:', withdrawalError);
      return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Allow approved, pending_retry, or processing status
    if (!['approved', 'pending_retry', 'processing'].includes(withdrawal.status)) {
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
          b2c_error_details: { error: 'B2C credentials not configured' },
          notes: (withdrawal.notes || '') + '\n[SYSTEM] B2C credentials not configured'
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({ error: 'M-Pesa B2C not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate predictable reference BEFORE B2C call
    // This allows callback to find the withdrawal even if this function times out
    const payoutReference = `WD-${withdrawal_id}`;

    // Update status to processing and store reference BEFORE making B2C call
    const attemptCount = (withdrawal.b2c_attempt_count || 0) + 1;
    await supabaseAdmin
      .from('withdrawals')
      .update({
        payment_reference: payoutReference,
        status: 'processing',
        b2c_attempt_count: attemptCount,
        last_b2c_attempt_at: new Date().toISOString(),
        notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C attempt ${attemptCount} started at ${new Date().toISOString()}`
      })
      .eq('id', withdrawal_id);

    // Get access token
    const accessToken = await getMpesaAccessToken();

    // Determine entity name and type for descriptive remarks
    let entityName = '';
    let entityType = '';
    if (withdrawal.chama?.name) {
      entityName = withdrawal.chama.name;
      entityType = 'Chama';
    } else if (withdrawal.mchango?.title) {
      entityName = withdrawal.mchango.title;
      entityType = 'Campaign';
    } else if (withdrawal.organization?.name) {
      entityName = withdrawal.organization.name;
      entityType = 'Org';
    } else if (withdrawal.welfare?.name) {
      entityName = withdrawal.welfare.name;
      entityType = 'Welfare';
    }

    // Build remarks - M-Pesa limits to 100 chars
    const remarks = entityName
      ? `${entityType} "${entityName}" payout`.substring(0, 100)
      : `Withdrawal ${withdrawal_id.substring(0, 8)}`;

    // Make B2C payment request
    const b2cPayload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'BusinessPayment',
      Amount: Math.floor(amount), // M-Pesa B2C requires whole numbers
      PartyA: shortcode,
      PartyB: formattedPhone,
      Remarks: remarks,
      QueueTimeOutURL: `${supabaseUrl}/functions/v1/b2c-callback`,
      ResultURL: `${supabaseUrl}/functions/v1/b2c-callback`,
      Occasion: payoutReference // Use our predictable reference for callback lookup
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

      // Determine if should retry or fail permanently
      const shouldRetry = attemptCount < 3;
      const newStatus = shouldRetry ? 'pending_retry' : 'failed';

      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: newStatus,
          b2c_error_details: { 
            error: `HTTP ${b2cResponse.status}: ${errorText}`,
            attempt: attemptCount,
            final_failure: !shouldRetry
          },
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C API HTTP error ${b2cResponse.status} (attempt ${attemptCount})`
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({
        success: false,
        error: `M-Pesa API returned HTTP ${b2cResponse.status}`,
        details: errorText,
        will_retry: shouldRetry
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const b2cResult = await b2cResponse.json();
    console.log('B2C response:', b2cResult);

    if (b2cResult.ResponseCode === '0') {
      // B2C request accepted - store ConversationID in notes only
      // IMPORTANT: Do NOT overwrite payment_reference here! Keep it as 'WD-<uuid>'
      // so the callback can find this withdrawal even if it arrives before this code runs.
      await supabaseAdmin
        .from('withdrawals')
        .update({
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C initiated: ConvID=${b2cResult.ConversationID}, OrigConvID=${b2cResult.OriginatorConversationID} (ref: ${payoutReference}, attempt ${attemptCount})`
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({
        success: true,
        message: 'B2C payment initiated',
        conversation_id: b2cResult.ConversationID,
        originator_conversation_id: b2cResult.OriginatorConversationID,
        payout_reference: payoutReference
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // B2C request failed at M-Pesa level
      console.error('B2C request failed:', b2cResult);

      const shouldRetry = attemptCount < 3;
      const newStatus = shouldRetry ? 'pending_retry' : 'failed';

      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: newStatus,
          b2c_error_details: {
            error: b2cResult.ResponseDescription || 'Unknown error',
            code: b2cResult.ResponseCode,
            attempt: attemptCount,
            final_failure: !shouldRetry
          },
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C failed (attempt ${attemptCount}): ${b2cResult.ResponseDescription || 'Unknown error'}`
        })
        .eq('id', withdrawal_id);

      return new Response(JSON.stringify({
        success: false,
        error: b2cResult.ResponseDescription || 'B2C request failed',
        error_code: b2cResult.ResponseCode,
        will_retry: shouldRetry
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: any) {
    console.error('Error in b2c-payout:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
