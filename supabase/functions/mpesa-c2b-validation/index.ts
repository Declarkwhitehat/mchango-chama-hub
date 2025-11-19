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

    // Basic validation rules
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

    // Validate account number format (e.g., ABC1, XYZ7)
    const match = accountNumber.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      console.log('Rejected: Invalid account number format:', accountNumber);
      return new Response(
        JSON.stringify({ 
          ResultCode: 'C2B00011', 
          ResultDesc: 'Invalid account number format. Use format like ABC1, XYZ7' 
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

    // Additional business rules can be added here
    // For example: minimum payment amount, maximum payment amount, etc.

    // Accept the payment
    console.log('Validation passed for account:', accountNumber);
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
    // On error, accept the payment by default to avoid blocking legitimate transactions
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
