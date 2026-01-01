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
    // Return public payment configuration
    // These are safe to expose as they're needed for users to make payments
    const config = {
      tillNumber: Deno.env.get('MPESA_TILL_NUMBER') || null,
      shortcode: Deno.env.get('MPESA_SHORTCODE') || null,
    };

    console.log('Payment config requested');

    return new Response(
      JSON.stringify(config),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error fetching payment config:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch payment config' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
