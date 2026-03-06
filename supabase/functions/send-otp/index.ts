import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { checkRateLimit, getClientIP } from '../_shared/rateLimiter.ts';

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
  purpose?: string;
}

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
    const { phone, purpose }: SendOTPRequest = await req.json();

    if (!phone || !/^\+\d{10,15}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use international format (e.g., +254712345678)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check rate limit for phone
    const phoneRateLimit = await checkRateLimit(supabase, phone, 'phone', 'forgot_password');
    if (!phoneRateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: phoneRateLimit.error || 'Too many OTP requests. Please try again later.',
          remainingAttempts: phoneRateLimit.remainingAttempts,
          resetTime: phoneRateLimit.resetTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Check rate limit for IP
    const clientIP = getClientIP(req);
    const ipRateLimit = await checkRateLimit(supabase, clientIP, 'ip', 'forgot_password');
    if (!ipRateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: ipRateLimit.error || 'Too many requests from your location. Please try again later.',
          remainingAttempts: ipRateLimit.remainingAttempts,
          resetTime: ipRateLimit.resetTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // For password reset, verify the phone exists in profiles first
    if (purpose === 'password_reset') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .single();

      if (profileError || !profile) {
        return new Response(
          JSON.stringify({ error: 'No account found with this phone number' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }
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
    console.error('Error in send-otp:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
