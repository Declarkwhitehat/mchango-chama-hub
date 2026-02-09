import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const validationData = await req.json();
    console.log('Received C2B validation request:', JSON.stringify(validationData, null, 2));

    // Extract validation details
    const {
      TransAmount: amount,
      BillRefNumber: accountNumber,
      MSISDN: phoneNumber,
    } = validationData;

    // Basic validation rules - only reject if critical data is missing
    if (!accountNumber) {
      console.log('Rejected: Missing account number');
      return new Response(
        JSON.stringify({ 
          ResultCode: 'C2B00011', 
          ResultDesc: 'Account number is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      console.log('Rejected: Invalid amount:', amount);
      return new Response(
        JSON.stringify({ 
          ResultCode: 'C2B00011', 
          ResultDesc: 'Invalid payment amount' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Accept all payments - validation of account codes happens in callback
    // The callback will handle unmatched codes and notify the customer
    console.log('✅ Validation passed for account:', accountNumber, 'Amount:', amount);
    return new Response(
      JSON.stringify({
        ResultCode: 0,
        ResultDesc: 'Accepted'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in C2B validation:', error);
    // Accept payments even on error - callback will handle matching
    return new Response(
      JSON.stringify({
        ResultCode: 0,
        ResultDesc: 'Accepted'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
