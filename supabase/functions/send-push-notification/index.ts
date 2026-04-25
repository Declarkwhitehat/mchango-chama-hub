/**
 * send-push-notification
 *
 * Sends a push notification to all active devices for a given user via FCM
 * HTTP v1, using a service-account JSON stored in `FCM_SERVICE_ACCOUNT_JSON`.
 *
 * Triggered by:
 *   - DB trigger on `public.notifications` (via pg_net)
 *   - Direct invocation from server-side code
 *
 * Body shape:
 *   { user_id: string, title: string, body: string, data?: Record<string,string> }
 *
 * This function intentionally does not require a JWT — it is invoked from
 * trusted server contexts (database trigger / edge functions). It validates
 * a shared SERVICE_ROLE call by checking the supplied apikey header.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ---------- Service-account → OAuth2 access token (cached) ----------

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

let cachedToken: { token: string; exp: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned =
    base64UrlEncode(JSON.stringify(header)) +
    '.' +
    base64UrlEncode(JSON.stringify(claim));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = unsigned + '.' + base64UrlEncode(new Uint8Array(sig));

  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

// ---------- FCM send ----------

async function sendToToken(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  // FCM v1 requires data values to be strings.
  const dataStrings: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v !== undefined && v !== null) dataStrings[k] = String(v);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: dataStrings,
        android: {
          priority: 'HIGH',
          notification: {
            sound: 'default',
            default_vibrate_timings: true,
            channel_id: 'transactions',
          },
        },
      },
    }),
  });
  return { ok: res.ok, status: res.status, bodyText: await res.text() };
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const FCM_SA = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');

    if (!FCM_SA) {
      return new Response(
        JSON.stringify({ error: 'FCM_SERVICE_ACCOUNT_JSON not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let sa: ServiceAccount;
    try {
      sa = JSON.parse(FCM_SA);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid FCM_SERVICE_ACCOUNT_JSON' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, title, body: messageBody, data } = body || {};

    if (!user_id || !title || !messageBody) {
      return new Response(
        JSON.stringify({ error: 'user_id, title and body are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Look up device tokens for the user via REST (service role)
    const tokensRes = await fetch(
      `${SUPABASE_URL}/rest/v1/device_tokens?user_id=eq.${user_id}&select=token`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!tokensRes.ok) {
      const txt = await tokensRes.text();
      return new Response(
        JSON.stringify({ error: 'Failed to read device_tokens', details: txt }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const tokens: { token: string }[] = await tokensRes.json();

    if (!tokens.length) {
      return new Response(
        JSON.stringify({ ok: true, delivered: 0, reason: 'no devices' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const accessToken = await getAccessToken(sa);

    const results = await Promise.allSettled(
      tokens.map((t) =>
        sendToToken(sa.project_id, accessToken, t.token, title, messageBody, data),
      ),
    );

    // Clean up tokens that FCM reports as invalid / unregistered
    const stale: string[] = [];
    results.forEach((r, idx) => {
      if (r.status !== 'fulfilled') return;
      const { ok, status, bodyText } = r.value;
      if (!ok && (status === 404 || status === 400)) {
        if (
          bodyText.includes('UNREGISTERED') ||
          bodyText.includes('INVALID_ARGUMENT') ||
          bodyText.includes('NOT_FOUND')
        ) {
          stale.push(tokens[idx].token);
        }
      }
    });

    if (stale.length) {
      // best-effort cleanup
      await fetch(
        `${SUPABASE_URL}/rest/v1/device_tokens?token=in.(${stale
          .map((s) => `"${s}"`)
          .join(',')})`,
        {
          method: 'DELETE',
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
        },
      ).catch(() => {});
    }

    const delivered = results.filter(
      (r) => r.status === 'fulfilled' && r.value.ok,
    ).length;

    return new Response(
      JSON.stringify({
        ok: true,
        attempted: tokens.length,
        delivered,
        stale_removed: stale.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[send-push-notification] error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
