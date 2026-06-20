// Module-scope Supabase service-role client singleton.
// Reusing one client instance keeps connection pool churn low under high RPS.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

let _client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'edge-shared-singleton' } },
  });
  return _client;
}
