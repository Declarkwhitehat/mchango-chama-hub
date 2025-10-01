import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendOTPRequest {
  phone: string;
  type: 'sms' | 'email';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, type }: SendOTPRequest = await req.json();

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // In production, you would:
    // 1. Store the OTP in database with expiry time
    // 2. Send via Twilio/AfricasTalking for SMS
    // 3. Send via email service for email

    console.log(`Generated OTP for ${phone}: ${otp}`);
    console.log(`OTP type: ${type}`);

    // For now, return success (implement actual sending with Twilio/AfricasTalking)
    // TODO: Add Twilio or AfricasTalking integration
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'OTP sent successfully',
        // In development, return OTP for testing
        ...(Deno.env.get('ENVIRONMENT') === 'development' && { otp })
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
