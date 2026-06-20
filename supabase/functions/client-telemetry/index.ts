// Lightweight, sampled client error/telemetry sink.
// Fire-and-forget from the browser via navigator.sendBeacon.
// Intentionally cheap: validate shape, log structured line, return 204.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const raw = await req.text();
    if (raw.length > 4000) {
      // Reject oversized payloads to keep abuse cheap.
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    // Structured log line — searchable in edge function logs.
    console.log(JSON.stringify({
      fn: 'client-telemetry',
      type: String(body.type ?? 'unknown').slice(0, 32),
      name: String(body.name ?? '').slice(0, 100),
      message: String(body.message ?? '').slice(0, 500),
      url: String(body.url ?? '').slice(0, 300),
      ua: String(body.ua ?? '').slice(0, 200),
      ts: body.ts ?? Date.now(),
    }));
  } catch (err) {
    console.error('client-telemetry error:', (err as Error)?.message);
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
