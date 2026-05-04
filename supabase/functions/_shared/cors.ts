// Restricted CORS configuration.
// Allow-list can be overridden by setting the ALLOWED_ORIGINS env var (comma-separated).
// All other CORS headers (Allow-Headers, Allow-Methods) are unchanged.

const DEFAULT_ALLOWED_ORIGINS = [
  // Production custom domains
  'https://pamojanova.com',
  'https://www.pamojanova.com',
  'https://pamojanova.online',
  'https://www.pamojanova.online',
  // Lovable-published URL
  'https://mchango-chama-hub.lovable.app',
  // Lovable preview/dev URL
  'https://id-preview--8a71b0bc-5b9c-4a2f-9a0f-1a31cc216d64.lovable.app',
  // Local development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  // Capacitor (native Android shell)
  'capacitor://localhost',
  'http://localhost',
];

const PRODUCTION_DEFAULT_ORIGIN = 'https://pamojanova.com';

function getAllowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') || '').trim();
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS;
  const parsed = fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

/** Pure helper: pick the right Access-Control-Allow-Origin value. */
export function resolveAllowedOrigin(origin: string | null | undefined): string {
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) return origin;
  return allowed.includes(PRODUCTION_DEFAULT_ORIGIN) ? PRODUCTION_DEFAULT_ORIGIN : allowed[0];
}

/** Build CORS headers for a specific request so the response Origin matches the caller. */
export function buildCorsHeaders(req?: Request | null): Record<string, string> {
  const origin = req?.headers.get('origin') ?? null;
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

/**
 * Backwards-compatible static export. Callers that import `corsHeaders` keep working;
 * the static value falls back to the production origin. Prefer `buildCorsHeaders(req)`
 * in new code so the Allow-Origin echoes the matched request origin.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': PRODUCTION_DEFAULT_ORIGIN,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Vary': 'Origin',
};
