import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');
    const shortcode = Deno.env.get('MPESA_SHORTCODE') || '4015351';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa credentials not configured');
    }

    // Debug: log credential lengths and first/last 4 chars to verify correct secrets are loaded
    console.log('🔑 Credential debug:', {
      keyLength: consumerKey.length,
      secretLength: consumerSecret.length,
      keyPreview: consumerKey.substring(0, 4) + '...' + consumerKey.substring(consumerKey.length - 4),
      secretPreview: consumerSecret.substring(0, 4) + '...' + consumerSecret.substring(consumerSecret.length - 4),
      areIdentical: consumerKey === consumerSecret,
    });

    // Step 1: Get OAuth token
    const authString = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenRes = await fetch(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        method: 'GET',
        headers: { Authorization: `Basic ${authString}` },
      }
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`OAuth failed: ${tokenRes.status} - ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log('✅ OAuth token obtained, token length:', accessToken?.length, 'expires_in:', tokenData.expires_in);

    // Step 2: Register C2B URLs
    const validationURL = `${supabaseUrl}/functions/v1/c2b-validate-payment`;
    const confirmationURL = `${supabaseUrl}/functions/v1/c2b-confirm-payment`;

    const registerPayload = {
      ShortCode: shortcode,
      ResponseType: 'Completed',
      ConfirmationURL: confirmationURL,
      ValidationURL: validationURL,
    };

    console.log('Registering C2B URLs:', JSON.stringify(registerPayload, null, 2));

    const registerRes = await fetch(
      'https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerPayload),
      }
    );

    const registerData = await registerRes.json();
    console.log('C2B Registration response:', JSON.stringify(registerData, null, 2));

    if (registerData.ResponseCode === '0' || registerData.ResponseDescription?.includes('success')) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'C2B URLs registered successfully with Safaricom',
          details: {
            shortcode,
            validationURL,
            confirmationURL,
            safaricomResponse: registerData,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'C2B URL registration returned unexpected response',
          safaricomResponse: registerData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error registering C2B URLs:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
