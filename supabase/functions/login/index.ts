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

    // Check rate limit: 5 attempts per 5 minutes (only for this specific email/phone)
    const FIVE_MINUTES = 5 * 60 * 1000;
    const MAX_LOGIN_ATTEMPTS = 5;

    // Check rate limit by identifier (email/phone) only - not by IP
    const identifierRateLimit = await checkRateLimit(
      supabase,
      normalizedIdentifier,
      identifierType,
      'login',
      FIVE_MINUTES,
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

    // If phone number, look up email from profiles
    let loginEmail = normalizedIdentifier;
    if (identifierType === 'phone') {
      console.log('[LOGIN DEBUG] Looking up profile for phone:', normalizedIdentifier);
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, id, full_name')
        .eq('phone', normalizedIdentifier)
        .limit(1)
        .single();

      if (profileError || !profile) {
        console.error('[LOGIN DEBUG] Profile lookup failed:', {
          phone: normalizedIdentifier,
          error: profileError,
          errorCode: profileError?.code,
          errorMessage: profileError?.message,
          errorDetails: profileError?.details,
          remainingAttempts: identifierRateLimit.remainingAttempts
        });
        return new Response(
          JSON.stringify({ 
            error: 'Invalid credentials - phone number not found',
            remainingAttempts: identifierRateLimit.remainingAttempts
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[LOGIN DEBUG] Profile found:', {
        profileId: profile.id,
        email: profile.email,
        name: profile.full_name
      });
      
      loginEmail = profile.email;
    }

    console.log('[LOGIN DEBUG] Attempting authentication with email:', loginEmail);

    // Attempt login using Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password,
    });

    if (authError) {
      console.error('[LOGIN DEBUG] Authentication failed:', {
        email: loginEmail,
        originalIdentifier: identifier,
        identifierType: identifierType,
        errorMessage: authError.message,
        errorName: authError.name,
        errorStatus: authError.status,
        errorCode: authError.code
      });

      // Fire-and-forget: record failed login for fraud monitoring
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        // Look up user_id by email for fraud tracking
        const { data: failedProfile } = await supabase.from('profiles').select('id').eq('email', loginEmail).maybeSingle();
        if (failedProfile?.id) {
          fetch(`${supabaseUrl}/functions/v1/fraud-monitor`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'record-event',
              user_id: failedProfile.id,
              rule_triggered: 'failed_login',
              risk_points: 5,
              ip_address: clientIP,
              metadata: { identifier_type: identifierType, error: authError.message },
            }),
          }).catch(e => console.error('Fraud monitor call failed:', e));
        }
      } catch (e) { console.error('Fraud monitoring error:', e); }

      return new Response(
        JSON.stringify({ 
          error: 'Invalid credentials - authentication failed',
          details: authError.message,
          remainingAttempts: identifierRateLimit.remainingAttempts
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[LOGIN DEBUG] Authentication successful for user:', authData.user.id);

    // Check if user has 2FA enabled
    const { data: totpData } = await supabase
      .from('totp_secrets')
      .select('is_enabled')
      .eq('user_id', authData.user.id)
      .eq('is_enabled', true)
      .maybeSingle();

    if (totpData?.is_enabled) {
      // Don't return session yet - require 2FA verification
      // Return a temporary token that the client will use after 2FA verification
      console.log('[LOGIN DEBUG] 2FA required for user:', authData.user.id);
      return new Response(
        JSON.stringify({ 
          requires2FA: true,
          userId: authData.user.id,
          // Store session temporarily - will be returned after 2FA verification
          pendingSession: authData.session,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record login IP in audit_logs using service role client
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: authData.user.id,
          table_name: 'auth',
          action: 'login',
          ip_address: clientIP,
          new_values: { event: 'login', ip: clientIP, identifier_type: identifierType }
        });
    } catch (auditErr) {
      console.error('Failed to record login audit log:', auditErr);
    }

    // Login successful - return session (no 2FA)
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
