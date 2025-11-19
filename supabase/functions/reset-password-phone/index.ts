import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { checkRateLimit, getClientIP } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ResetPasswordRequest {
  phone: string;
  newPassword: string;
  otp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { phone, newPassword, otp }: ResetPasswordRequest = await req.json();

    if (!phone || !newPassword || !otp) {
      return new Response(
        JSON.stringify({ error: 'Phone number, OTP, and new password are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check rate limit for phone
    const phoneRateLimit = await checkRateLimit(supabase, phone, 'phone', 'password_reset_confirm');
    if (!phoneRateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: phoneRateLimit.error || 'Too many password reset attempts. Please try again later.',
          remainingAttempts: phoneRateLimit.remainingAttempts,
          resetTime: phoneRateLimit.resetTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Check rate limit for IP
    const clientIP = getClientIP(req);
    const ipRateLimit = await checkRateLimit(supabase, clientIP, 'ip', 'password_reset_confirm');
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

    // Verify OTP first
    const { data: otpRecords, error: fetchError } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone', phone)
      .eq('verified', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError || !otpRecords || otpRecords.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired OTP. Please verify your OTP first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get user by phone number
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('phone', phone)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'No account found with this phone number' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Update password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update password. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Invalidate the OTP record
    await supabase
      .from('otp_verifications')
      .update({ verified: false })
      .eq('phone', phone);

    console.log(`Password reset successful for user ${profile.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Password reset successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in reset-password-phone:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
