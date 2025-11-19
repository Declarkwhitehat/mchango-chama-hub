import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { checkRateLimit, getClientIP } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return new Response(
        JSON.stringify({ error: 'Email/phone and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientIP = getClientIP(req);

    // Normalize phone number if it looks like a phone
    let normalizedIdentifier = identifier.trim();
    let identifierType: 'email' | 'phone' = 'email';

    if (/^[0-9+\s-]+$/.test(normalizedIdentifier)) {
      identifierType = 'phone';
      // Normalize phone number to +254 format
      let phoneNumber = normalizedIdentifier.replace(/[\s-]/g, '');
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '+254' + phoneNumber.slice(1);
      } else if (phoneNumber.startsWith('7') || phoneNumber.startsWith('1')) {
        phoneNumber = '+254' + phoneNumber;
      } else if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+254' + phoneNumber;
      }
      normalizedIdentifier = phoneNumber;
    }

    // Check rate limit: 5 attempts per 1 hour
    const ONE_HOUR = 60 * 60 * 1000;
    const MAX_LOGIN_ATTEMPTS = 5;

    // Check rate limit by identifier (email/phone)
    const identifierRateLimit = await checkRateLimit(
      supabase,
      normalizedIdentifier,
      identifierType,
      'login',
      ONE_HOUR,
      MAX_LOGIN_ATTEMPTS
    );

    if (!identifierRateLimit.allowed) {
      console.log(`Rate limit exceeded for ${identifierType}: ${normalizedIdentifier}`);
      return new Response(
        JSON.stringify({ 
          error: identifierRateLimit.error || 'Too many login attempts',
          remainingAttempts: 0,
          resetTime: identifierRateLimit.resetTime
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit by IP
    const ipRateLimit = await checkRateLimit(
      supabase,
      clientIP,
      'ip',
      'login',
      ONE_HOUR,
      MAX_LOGIN_ATTEMPTS
    );

    if (!ipRateLimit.allowed) {
      console.log(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          error: ipRateLimit.error || 'Too many login attempts from this location',
          remainingAttempts: 0,
          resetTime: ipRateLimit.resetTime
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If phone number, look up email from profiles
    let loginEmail = normalizedIdentifier;
    if (identifierType === 'phone') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('phone', normalizedIdentifier)
        .maybeSingle();

      if (profileError || !profile) {
        console.error('Profile lookup error:', profileError);
        return new Response(
          JSON.stringify({ error: 'Invalid credentials' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      loginEmail = profile.email;
    }

    // Attempt login using Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password,
    });

    if (authError) {
      console.error('Authentication error:', authError.message);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid credentials',
          remainingAttempts: Math.min(identifierRateLimit.remainingAttempts, ipRateLimit.remainingAttempts)
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Login successful - return session
    return new Response(
      JSON.stringify({ 
        session: authData.session,
        user: authData.user
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred during login' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
