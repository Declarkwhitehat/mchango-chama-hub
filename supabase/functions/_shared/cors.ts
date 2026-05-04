// Restricted CORS configuration with pattern-based matching for Lovable preview/sandbox hosts.
// Allow-list can be overridden by setting the ALLOWED_ORIGINS env var (comma-separated).

const DEFAULT_ALLOWED_ORIGINS = [
  // Production custom domains
  'https://pamojanova.com',
  'https://www.pamojanova.com',
  'https://pamojanova.online',
  'https://www.pamojanova.online',
  // Lovable-published URL
  'https://mchango-chama-hub.lovable.app',
  // Local development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  // Capacitor (native Android shell)
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

// Hostname patterns that are always allowed (Lovable preview/sandbox infrastructure).
// These cover preview iframes, branch previews, and sandbox URLs that change per session.
const ALLOWED_HOST_SUFFIXES = [
  '.lovable.app',
  '.lovable.dev',
  '.lovableproject.com',
];

const PRODUCTION_DEFAULT_ORIGIN = 'https://pamojanova.com';

function getAllowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') || '').trim();
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS;
  const parsed = fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

function isOriginAllowed(origin: string): boolean {
  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
  } catch {
    return false;
  }
}

/** Pure helper: pick the right Access-Control-Allow-Origin value. */
export function resolveAllowedOrigin(origin: string | null | undefined): string {
  if (origin && isOriginAllowed(origin)) return origin;
  return PRODUCTION_DEFAULT_ORIGIN;
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
 * Backwards-compatible static export used by many existing Edge Functions.
 * Uses '*' so previously-working calls from any Lovable preview/sandbox host
 * keep working. Sensitive functions should migrate to `buildCorsHeaders(req)`
 * for strict per-request origin echoing.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};
