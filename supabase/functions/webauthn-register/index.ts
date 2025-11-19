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

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle GET request - list user's credentials
    if (req.method === 'GET') {
      const { data: credentials, error: listError } = await supabase
        .from('webauthn_credentials')
        .select('id, credential_id, device_name, created_at, last_used_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (listError) {
        console.error('Error listing credentials:', listError);
        return new Response(
          JSON.stringify({ error: 'Failed to list credentials' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ credentials: credentials || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle DELETE request - remove a specific credential
    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const credentialId = url.searchParams.get('credentialId');

      if (!credentialId) {
        return new Response(
          JSON.stringify({ error: 'Missing credentialId parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the credential belongs to the user
      const { data: credential, error: checkError } = await supabase
        .from('webauthn_credentials')
        .select('user_id')
        .eq('credential_id', credentialId)
        .single();

      if (checkError || !credential || credential.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Credential not found or unauthorized' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: deleteError } = await supabase
        .from('webauthn_credentials')
        .delete()
        .eq('credential_id', credentialId);

      if (deleteError) {
        console.error('Error deleting credential:', deleteError);
        return new Response(
          JSON.stringify({ error: 'Failed to delete credential' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Credential removed successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle POST request - registration actions
    const { action, credentialId, publicKey, deviceName } = await req.json();

    if (action === 'generate-challenge') {
      // Generate a random challenge for registration
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const challengeBase64 = btoa(String.fromCharCode(...challenge));
      
      return new Response(
        JSON.stringify({
          challenge: challengeBase64,
          userId: user.id,
          userName: user.email || user.phone || 'user'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'register-credential') {
      // Validate inputs
      if (!credentialId || !publicKey) {
        return new Response(
          JSON.stringify({ error: 'Missing credential data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if credential already exists
      const { data: existingCred } = await supabase
        .from('webauthn_credentials')
        .select('id')
        .eq('credential_id', credentialId)
        .single();

      if (existingCred) {
        return new Response(
          JSON.stringify({ error: 'Credential already registered' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Store the credential
      const { error: insertError } = await supabase
        .from('webauthn_credentials')
        .insert({
          user_id: user.id,
          credential_id: credentialId,
          public_key: publicKey,
          device_name: deviceName || 'Biometric Device',
          counter: 0
        });

      if (insertError) {
        console.error('Error storing credential:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to store credential' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Biometric login enabled successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('WebAuthn registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});