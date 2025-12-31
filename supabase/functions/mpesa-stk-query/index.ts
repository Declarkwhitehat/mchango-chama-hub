import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface STKQueryRequest {
  checkout_request_id: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: STKQueryRequest = await req.json();

    const checkoutRequestId = body?.checkout_request_id?.trim();
    if (!checkoutRequestId) {
      return new Response(JSON.stringify({ error: "checkout_request_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY") ?? "";
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET") ?? "";
    const shortcode = Deno.env.get("MPESA_SHORTCODE") ?? "174379";
    const passkey = Deno.env.get("MPESA_PASSKEY") ?? "";

    if (!consumerKey || !consumerSecret || !passkey) {
      return new Response(JSON.stringify({ error: "M-Pesa credentials are not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Step 1: Get Access Token (PRODUCTION) ---
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResponse = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } },
    );

    const tokenData = await tokenResponse.json();
    if (!tokenData?.access_token) {
      console.error("Failed to get access token:", tokenData);
      return new Response(JSON.stringify({ error: "Failed to get M-Pesa access token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = btoa(shortcode + passkey + timestamp);

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    console.log("STK Query payload:", {
      ...payload,
      Password: "****",
      CheckoutRequestID: checkoutRequestId,
    });

    // --- Step 2: Query STK status (PRODUCTION) ---
    const queryResponse = await fetch(
      "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await queryResponse.json();
    console.log("STK Query response:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mpesa-stk-query error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
