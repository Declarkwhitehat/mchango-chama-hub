import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base32 encoding/decoding
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return result;
}

function base32Decode(str: string): Uint8Array {
  str = str.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of str) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function generateTOTP(secret: string, timeStep = 30, digits = 6): Promise<string> {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer));

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);

  return code.toString().padStart(digits, '0');
}

async function verifyTOTP(secret: string, token: string, window = 1): Promise<boolean> {
  for (let i = -window; i <= window; i++) {
    const time = Math.floor(Date.now() / 1000 / 30) + i;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, time, false);

    const key = base32Decode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );
    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer));

    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;

    if (code.toString().padStart(6, '0') === token) {
      return true;
    }
  }
  return false;
}

function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    codes.push(code.slice(0, 4) + '-' + code.slice(4));
  }
  return codes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, token, userId } = await req.json();

    // Actions that require auth: setup, verify-setup, disable, status
    // Actions that don't require auth: verify-login (used during login before session exists)
    
    if (action === 'verify-login') {
      // Verify TOTP during login - no auth header needed, uses userId from login flow
      if (!userId || !token) {
        return new Response(
          JSON.stringify({ error: 'User ID and token required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: totpData, error: totpError } = await supabase
        .from('totp_secrets')
        .select('encrypted_secret, backup_codes, is_enabled')
        .eq('user_id', userId)
        .eq('is_enabled', true)
        .single();

      if (totpError || !totpData) {
        return new Response(
          JSON.stringify({ error: '2FA not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if it's a backup code
      if (token.includes('-') && totpData.backup_codes?.includes(token)) {
        // Remove used backup code
        const updatedCodes = totpData.backup_codes.filter((c: string) => c !== token);
        await supabase
          .from('totp_secrets')
          .update({ backup_codes: updatedCodes })
          .eq('user_id', userId);

        return new Response(
          JSON.stringify({ verified: true, backupCodeUsed: true, remainingBackupCodes: updatedCodes.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify TOTP code
      const isValid = await verifyTOTP(totpData.encrypted_secret, token);

      // Fire-and-forget: record failed 2FA for fraud monitoring
      if (!isValid) {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          fetch(`${supabaseUrl}/functions/v1/fraud-monitor`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'record-event',
              user_id: userId,
              rule_triggered: 'failed_2fa',
              risk_points: 10,
              metadata: { attempt_type: 'totp' },
            }),
          }).catch(e => console.error('Fraud monitor call failed:', e));
        } catch (e) { console.error('Fraud monitoring error:', e); }
      }

      return new Response(
        JSON.stringify({ verified: isValid }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All other actions require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwtToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwtToken);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'status') {
      const { data: totpData } = await supabase
        .from('totp_secrets')
        .select('is_enabled, created_at, verified_at')
        .eq('user_id', user.id)
        .single();

      return new Response(
        JSON.stringify({ 
          enabled: totpData?.is_enabled || false,
          setupAt: totpData?.verified_at || null 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'setup') {
      // Generate new TOTP secret
      const secretBytes = crypto.getRandomValues(new Uint8Array(20));
      const secret = base32Encode(secretBytes);
      const backupCodes = generateBackupCodes();

      // Get user email for the TOTP URI
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user.id)
        .single();

      const issuer = 'Mchango';
      const accountName = profile?.email || user.email || 'user';
      const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

      // Store secret (not yet enabled until verified)
      await supabase
        .from('totp_secrets')
        .upsert({
          user_id: user.id,
          encrypted_secret: secret,
          is_enabled: false,
          backup_codes: backupCodes,
          verified_at: null,
        }, { onConflict: 'user_id' });

      return new Response(
        JSON.stringify({ secret, otpauthUri, backupCodes }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify-setup') {
      // Verify the code to confirm setup
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Token required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: totpData, error: totpError } = await supabase
        .from('totp_secrets')
        .select('encrypted_secret')
        .eq('user_id', user.id)
        .single();

      if (totpError || !totpData) {
        return new Response(
          JSON.stringify({ error: 'No TOTP secret found. Please start setup again.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isValid = await verifyTOTP(totpData.encrypted_secret, token);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid code. Please try again.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enable 2FA
      await supabase
        .from('totp_secrets')
        .update({ is_enabled: true, verified_at: new Date().toISOString() })
        .eq('user_id', user.id);

      return new Response(
        JSON.stringify({ success: true, message: '2FA enabled successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'disable') {
      // Require current TOTP code to disable
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Current 2FA code required to disable' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: totpData } = await supabase
        .from('totp_secrets')
        .select('encrypted_secret, backup_codes')
        .eq('user_id', user.id)
        .single();

      if (!totpData) {
        return new Response(
          JSON.stringify({ error: '2FA not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check TOTP or backup code
      let isValid = await verifyTOTP(totpData.encrypted_secret, token);
      if (!isValid && token.includes('-') && totpData.backup_codes?.includes(token)) {
        isValid = true;
      }

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete TOTP record
      await supabase
        .from('totp_secrets')
        .delete()
        .eq('user_id', user.id);

      return new Response(
        JSON.stringify({ success: true, message: '2FA disabled successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('TOTP 2FA error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
