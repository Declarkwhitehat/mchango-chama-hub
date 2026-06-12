import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // DEPRECATED: 40%-rejoin deletion has been replaced by chama-auto-restart's
    // auto-continue model. Debt-free members continue automatically; debtors are
    // removed individually. This cron is now a no-op kept for backward compatibility.
    console.log('chama-auto-cleanup: deprecated 40%-rejoin path is a no-op.');
    return new Response(JSON.stringify({
      message: 'Deprecated — auto-continue handles chama lifecycle now',
      processed: 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in chama-auto-cleanup:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
