import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CELCOM_API_KEY = Deno.env.get('CELCOM_API_KEY');
const CELCOM_PARTNER_ID = Deno.env.get('CELCOM_PARTNER_ID');
const CELCOM_SHORTCODE = Deno.env.get('CELCOM_SHORTCODE');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SendOTPRequest {
  phone: string;
}

// Rate limiting: max 3 OTP requests per phone per hour
const checkRateLimit = async (supabase: any, phone: string): Promise<boolean> => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('otp_verifications')
    .select('id')
    .eq('phone', phone)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('Rate limit check error:', error);
    return false;
  }

  return data.length < 3;
};

const sendSMS = async (phone: string, message: string): Promise<boolean> => {
  try {
    const response = await fetch('https://isms.celcomafrica.com/api/services/sendsms/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'h_api_key': CELCOM_API_KEY!,
      },
      body: JSON.stringify({
        partnerID: CELCOM_PARTNER_ID,
        apikey: CELCOM_API_KEY,
        pass_type: 'plain',
        clientsmsid: Math.random().toString(36).substring(7),
        mobile: phone,
        message: message,
        shortcode: CELCOM_SHORTCODE,
      }),
    });

    const result = await response.json();
    console.log('Celcom SMS response:', result);
    
    // Celcom returns success: true on success
    return result.success === true || response.ok;
  } catch (error) {
    console.error('SMS sending error:', error);
    return false;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { phone }: SendOTPRequest = await req.json();

    if (!phone || !/^\+\d{10,15}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use international format (e.g., +254712345678)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check rate limit
    const canSend = await checkRateLimit(supabase, phone);
    if (!canSend) {
      return new Response(
        JSON.stringify({ error: 'Too many OTP requests. Please try again later.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Clean up expired OTPs
    await supabase.rpc('cleanup_expired_otps');

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store OTP in database
    const { error: insertError } = await supabase
      .from('otp_verifications')
      .insert({
        phone,
        otp,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('Database error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate OTP' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Send SMS via Celcom
    const message = `Your verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
    const smsSent = await sendSMS(phone, message);

    if (!smsSent) {
      return new Response(
        JSON.stringify({ error: 'Failed to send SMS. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`OTP sent successfully to ${phone}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'OTP sent successfully',
        expiresIn: 300 // 5 minutes in seconds
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in send-otp:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
