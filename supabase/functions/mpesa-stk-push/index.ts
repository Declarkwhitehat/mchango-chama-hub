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
    console.log('Incoming STK push request:', body);

    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? '';
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? '';
    const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? '174379'; // sandbox default
    const passkey = Deno.env.get('MPESA_PASSKEY') ?? '';

    // --- Step 1: Get Access Token ---
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResponse = await fetch(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
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

    console.log('STK Push payload:', payload);

    // --- Step 3: Send STK Push ---
    const stkResponse = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
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

    // --- Step 4: Save Transaction (Optional) ---
    if (result.CheckoutRequestID) {
      const { error } = await supabaseClient
        .from('donations')
        .insert([
          {
            phone_number: body.phone_number,
            amount: body.amount,
            chama_id: body.chama_id || null,
            mchango_id: body.mchango_id || null,
            status: 'PENDING',
            checkout_request_id: result.CheckoutRequestID,
            merchant_request_id: result.MerchantRequestID,
          },
        ]);

      if (error) console.error('Supabase insert error:', error);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('STK Push Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
