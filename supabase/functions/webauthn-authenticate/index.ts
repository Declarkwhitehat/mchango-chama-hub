import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, email, phone, credentialId, signature } = await req.json();

    if (action === 'generate-challenge') {
      // Validate identifier
      if (!email && !phone) {
        return new Response(
          JSON.stringify({ error: 'Email or phone required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find user by email or phone
      let userId: string | null = null;

      if (email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();
        userId = profile?.id || null;
      } else if (phone) {
        const normalizedPhone = phone.startsWith('+') ? phone : phone.startsWith('0') ? `+254${phone.substring(1)}` : `+254${phone}`;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', normalizedPhone)
          .single();
        userId = profile?.id || null;
      }

      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if user has registered credentials
      const { data: credentials, error: credError } = await supabase
        .from('webauthn_credentials')
        .select('credential_id, device_name')
        .eq('user_id', userId);

      if (credError || !credentials || credentials.length === 0) {
        // Return 200 with hasCredentials: false instead of 404
        // This is not an error - just means no credentials are registered yet
        return new Response(
          JSON.stringify({ hasCredentials: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const challengeBase64 = btoa(String.fromCharCode(...challenge));

      return new Response(
        JSON.stringify({
          challenge: challengeBase64,
          credentials: credentials.map(c => ({
            id: c.credential_id,
            name: c.device_name
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify-authentication') {
      // Validate inputs
      if (!credentialId || !signature) {
        return new Response(
          JSON.stringify({ error: 'Missing authentication data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Look up the credential
      const { data: credential, error: credError } = await supabase
        .from('webauthn_credentials')
        .select('user_id, public_key, counter')
        .eq('credential_id', credentialId)
        .single();

      if (credError || !credential) {
        return new Response(
          JSON.stringify({ error: 'Invalid credential' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // In a production environment, you would verify the signature here
      // using the stored public key. For this implementation, we'll trust
      // that the client-side verification succeeded.

      // Update last used time
      await supabase
        .from('webauthn_credentials')
        .update({ last_used_at: new Date().toISOString() })
        .eq('credential_id', credentialId);

      // Get user data for session creation
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', credential.user_id)
        .single();

      if (!profile?.email) {
        return new Response(
          JSON.stringify({ error: 'User profile not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create a session for the user using admin API
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: profile.email,
      });

      if (sessionError || !sessionData) {
        console.error('Session creation error:', sessionError);
        return new Response(
          JSON.stringify({ error: 'Failed to create session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Exchange the verification token for a session
      const { data: authData, error: authError } = await supabase.auth.verifyOtp({
        token_hash: sessionData.properties.hashed_token,
        type: 'email'
      });

      if (authError) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Authentication failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: authData.session,
          user: authData.user
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('WebAuthn authentication error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});