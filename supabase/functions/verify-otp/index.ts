import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface VerifyOTPRequest {
  phone: string;
  otp: string;
  userId?: string; // Optional: to update profile after verification
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { phone, otp, userId }: VerifyOTPRequest = await req.json();

    if (!phone || !otp) {
      return new Response(
        JSON.stringify({ error: 'Phone number and OTP are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get the most recent valid OTP for this phone
    const { data: otpRecords, error: fetchError } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone', phone)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify OTP' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!otpRecords || otpRecords.length === 0) {
      return new Response(
        JSON.stringify({ error: 'OTP expired or invalid. Please request a new one.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const otpRecord = otpRecords[0];

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return new Response(
        JSON.stringify({ error: 'Maximum verification attempts exceeded. Please request a new OTP.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      // Increment attempts
      await supabase
        .from('otp_verifications')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id);

      const remainingAttempts = otpRecord.max_attempts - otpRecord.attempts - 1;
      return new Response(
        JSON.stringify({ 
          error: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Mark OTP as verified
    const { error: updateError } = await supabase
      .from('otp_verifications')
      .update({ verified: true })
      .eq('id', otpRecord.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify OTP' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // If userId provided, update profile
    if (userId) {
      await supabase
        .from('profiles')
        .update({ 
          phone_verified: true,
          phone_otp_verified: true 
        })
        .eq('id', userId);
    }

    console.log(`OTP verified successfully for ${phone}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Phone number verified successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in verify-otp:', {
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
