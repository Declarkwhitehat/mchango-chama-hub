import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { checkRateLimit, getClientIP } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestPasswordResetRequest {
  email: string;
  redirectTo: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { email, redirectTo }: RequestPasswordResetRequest = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check rate limit for email
    const emailRateLimit = await checkRateLimit(supabase, email, 'email', 'forgot_password');
    if (!emailRateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: emailRateLimit.error || 'Too many password reset requests. Please try again later.',
          remainingAttempts: emailRateLimit.remainingAttempts,
          resetTime: emailRateLimit.resetTime
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

    // Send password reset email using Supabase Auth
    const { error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo,
      },
    });

    if (resetError) {
      console.error('Password reset error:', resetError);
      // Don't reveal if email exists or not for security
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Password reset email sent to ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Password reset email sent successfully',
        remainingAttempts: emailRateLimit.remainingAttempts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in request-password-reset:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
