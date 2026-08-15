import { corsHeaders } from '../_shared/cors.ts';

/**
 * DISABLED. Chama payouts are no longer accelerated when everybody has paid.
 * Every cycle is paid out by daily-payout-cron at 21:00 EAT on its payout day,
 * whether or not all members have paid. Kept as a no-op so any stale schedule
 * or caller cannot create an early payout.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ success: true, disabled: true, message: 'Early payouts are disabled; payouts run at 21:00 EAT.' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
