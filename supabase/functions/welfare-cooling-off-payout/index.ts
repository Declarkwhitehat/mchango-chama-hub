import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Find welfare withdrawals where cooling-off period has expired
    const { data: readyWithdrawals, error } = await supabaseAdmin
      .from('withdrawals')
      .select('id, amount, net_amount, notes, welfare_id, requested_by')
      .eq('status', 'approved')
      .not('welfare_id', 'is', null)
      .not('cooling_off_until', 'is', null)
      .lte('cooling_off_until', new Date().toISOString());

    if (error) throw error;

    console.log(`Found ${readyWithdrawals?.length || 0} welfare withdrawals ready for payout after cooling-off`);

    const results: any[] = [];

    for (const withdrawal of (readyWithdrawals || [])) {
      try {
        // Extract recipient phone from notes
        const phoneMatch = (withdrawal.notes || '').match(/Recipient:\s*([\d+]+)/);
        const recipientPhone = phoneMatch?.[1];

        if (!recipientPhone) {
          console.error(`No recipient phone for withdrawal ${withdrawal.id}`);
          results.push({ id: withdrawal.id, status: 'error', error: 'No recipient phone' });
          continue;
        }

        // Update status to processing
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'processing',
            notes: (withdrawal.notes || '') + '\n[SYSTEM] Cooling-off period complete. Initiating B2C payout.',
          })
          .eq('id', withdrawal.id);

        // Trigger B2C payout
        const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            withdrawal_id: withdrawal.id,
            phone_number: recipientPhone,
            amount: withdrawal.net_amount || withdrawal.amount,
          }),
        });

        const b2cResult = await b2cResponse.json();
        console.log(`B2C payout for ${withdrawal.id}:`, b2cResult);
        results.push({ id: withdrawal.id, status: 'triggered', b2c: b2cResult });
      } catch (e: any) {
        console.error(`Failed to process withdrawal ${withdrawal.id}:`, e.message);
        results.push({ id: withdrawal.id, status: 'error', error: e.message });
      }
    }

    return new Response(JSON.stringify({ 
      processed: results.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('welfare-cooling-off-payout error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
