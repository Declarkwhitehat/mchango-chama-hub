import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface STKPushRequest {
  phone_number: string;
  amount: number;
  account_reference: string;
  transaction_desc: string;
  payment_reference: string;
  chama_id?: string;
  mchango_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const requestBody: STKPushRequest = await req.json();
    const { phone_number, amount, account_reference, transaction_desc, payment_reference, chama_id, mchango_id } = requestBody;

    // Validate required fields
    if (!phone_number || !amount || !payment_reference) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for idempotency - if payment_reference already exists, return existing transaction
    const { data: existingTransaction } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('payment_reference', payment_reference)
      .single();

    if (existingTransaction) {
      return new Response(
        JSON.stringify({ 
          message: 'Transaction already exists',
          transaction: existingTransaction 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get M-PESA credentials from secrets
    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');
    const passkey = Deno.env.get('MPESA_PASSKEY');
    const shortcode = Deno.env.get('MPESA_SHORTCODE') || '174379'; // Default sandbox shortcode
    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`;

    if (!consumerKey || !consumerSecret) {
      throw new Error('M-PESA credentials not configured');
    }

    // Step 1: Get OAuth token
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResponse = await fetch(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      }
    );

    if (!tokenResponse.ok) {
      throw new Error('Failed to get M-PESA access token');
    }

    const { access_token } = await tokenResponse.json();

    // Step 2: Prepare STK Push request
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = btoa(`${shortcode}${passkey || ''}${timestamp}`);
    
    // Format phone number (remove + and ensure it starts with 254)
    let formattedPhone = phone_number.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('+254')) {
      formattedPhone = formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith('254')) {
      formattedPhone = '254' + formattedPhone;
    }

    const stkPushPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: account_reference || payment_reference,
      TransactionDesc: transaction_desc || 'Payment',
    };

    // Step 3: Send STK Push
    const stkResponse = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stkPushPayload),
      }
    );

    const stkData = await stkResponse.json();

    // Step 4: Create pending transaction record
    const { data: transaction, error: transactionError } = await supabaseClient
      .from('transactions')
      .insert({
        user_id: user.id,
        chama_id: chama_id || null,
        mchango_id: mchango_id || null,
        amount: amount,
        type: 'contribution',
        status: 'pending',
        payment_reference: payment_reference,
        mpesa_receipt_number: null,
        description: transaction_desc || 'M-PESA payment',
        metadata: {
          phone_number: formattedPhone,
          merchant_request_id: stkData.MerchantRequestID,
          checkout_request_id: stkData.CheckoutRequestID,
          response_code: stkData.ResponseCode,
          response_description: stkData.ResponseDescription,
        },
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Transaction creation error:', transactionError);
      throw transactionError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'STK Push sent successfully',
        transaction: transaction,
        mpesa_response: stkData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
