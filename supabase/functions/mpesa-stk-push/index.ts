import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schemas
const validatePhone = (phone: string): boolean => {
  // Kenyan phone format: +254XXXXXXXXX (total 13 chars)
  return /^\+254[17]\d{8}$/.test(phone);
};

const validateAmount = (amount: number): boolean => {
  return amount >= 1 && amount <= 1000000 && Number.isFinite(amount);
};

interface STKPushRequest {
  phone_number: string;
  amount: number;
  account_reference: string;
  transaction_desc: string;
  chama_id?: string;
  mchango_id?: string;
  callback_metadata?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: STKPushRequest = await req.json();
    console.log('Incoming STK push request:', { ...body, phone_number: body.phone_number?.substring(0, 7) + '****' });

    // Validate inputs
    if (!validatePhone(body.phone_number)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use +254XXXXXXXXX' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validateAmount(body.amount)) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount. Must be between 1 and 1,000,000' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.account_reference && body.account_reference.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Account reference too long (max 100 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? '';
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? '';
    const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? '174379'; // sandbox default
    const passkey = Deno.env.get('MPESA_PASSKEY') ?? '';

    // --- Step 1: Get Access Token (PRODUCTION) ---
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResponse = await fetch(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const tokenData = await tokenResponse.json();
    console.log('Access Token Response:', tokenData);

    if (!tokenData.access_token) {
      throw new Error('Failed to get access token from Safaricom.');
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    const password = btoa(shortcode + passkey + timestamp);

    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`;
    console.log('Using Callback URL:', callbackUrl);

    // --- Step 2: Prepare STK Push Payload ---
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: body.amount,
      PartyA: body.phone_number,
      PartyB: shortcode,
      PhoneNumber: body.phone_number,
      CallBackURL: callbackUrl,
      AccountReference: body.account_reference || 'Donation',
      TransactionDesc: body.transaction_desc || 'Donation Payment',
    };

    console.log('STK Push payload:', { ...payload, Password: '****' });

    // --- Step 3: Send STK Push (PRODUCTION) ---
    const stkResponse = await fetch(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await stkResponse.json();
    console.log('STK Push API Response:', result);

    // --- Step 4: Create or update deposit record if this is a savings deposit ---
    let depositId = null;
    if (body.callback_metadata?.type === 'savings_deposit' && result.CheckoutRequestID) {
      const checkoutRequestId = result.CheckoutRequestID;
      const commissionAmount = body.amount * 0.01;
      const netAmount = body.amount - commissionAmount;
      const isRetry = body.callback_metadata.is_retry || false;
      const existingDepositId = body.callback_metadata.existing_deposit_id;
      const retryCount = body.callback_metadata.retry_count || 0;

      if (isRetry && existingDepositId) {
        // Update existing deposit for retry
        console.log('Updating existing deposit for retry:', {
          depositId: existingDepositId,
          checkoutRequestId,
          retryCount
        });

        const { data: updateResult, error: updateError } = await supabaseClient
          .from('saving_group_deposits')
          .update({
            payment_reference: checkoutRequestId,
            status: 'pending',
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            failed_reason: null, // Clear previous failure reason
          })
          .eq('id', existingDepositId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating deposit record:', updateError);
        } else {
          depositId = existingDepositId;
          console.log('Deposit record updated for retry:', depositId);
        }
      } else {
        // Create new deposit record
        console.log('Creating new pending deposit record:', {
          groupId: body.callback_metadata.group_id,
          amount: body.amount,
          checkoutRequestId
        });

        const { data: depositRecord, error: depositError } = await supabaseClient
          .from('saving_group_deposits')
          .insert({
            saving_group_id: body.callback_metadata.group_id,
            member_user_id: body.callback_metadata.beneficiary_user_id,
            payer_user_id: body.callback_metadata.payer_user_id,
            amount: body.amount,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            payment_reference: checkoutRequestId,
            status: 'pending',
            saved_for_member_id: body.callback_metadata.saved_for_member_id || null,
            retry_count: 0,
            max_retries: 3,
          })
          .select()
          .single();

        if (depositError) {
          console.error('Error creating deposit record:', depositError);
        } else {
          depositId = depositRecord.id;
          console.log('Deposit record created:', depositId);
        }
      }
    }

    // --- Step 5: Return result with deposit_id ---
    return new Response(JSON.stringify({ ...result, deposit_id: depositId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('STK Push error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
