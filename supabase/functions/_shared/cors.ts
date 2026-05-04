// Shared CORS headers for Supabase Edge Functions.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

/** Backwards-compatible helper: returns the same permissive headers regardless of request. */
export function buildCorsHeaders(_req?: Request | null): Record<string, string> {
  return corsHeaders;
}

/** Backwards-compatible helper retained for callers that imported it. */
export function resolveAllowedOrigin(_origin: string | null | undefined): string {
  return '*';
}
