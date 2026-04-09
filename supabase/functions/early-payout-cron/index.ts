import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Early Payout Cron — runs at 7:00 PM EAT (16:00 UTC)
 * Only processes chamas where ALL active members have fully paid for the current cycle.
 * This allows 100%-paid chamas to get their payout 3 hours early instead of waiting until 10 PM.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[EARLY-PAYOUT] Started at:', new Date().toISOString());

    // Get all active chamas in batches to avoid timeout
    const BATCH_SIZE = 100;
    let allChamas: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch, error: batchError } = await supabase
        .from('chama')
        .select('id, name, contribution_amount, commission_rate')
        .eq('status', 'active')
        .range(offset, offset + BATCH_SIZE - 1);

      if (batchError) {
        console.error('Error fetching chamas:', batchError);
        return new Response(JSON.stringify({ error: batchError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      allChamas = allChamas.concat(batch || []);
      hasMore = (batch?.length || 0) >= BATCH_SIZE;
      offset += BATCH_SIZE;
    }

    const chamas = allChamas;

    let earlyPayoutsTriggered = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const chama of chamas || []) {
      // Find the current active cycle (not complete, not yet processed)
      const { data: activeCycle } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number, end_date, beneficiary_member_id')
        .eq('chama_id', chama.id)
        .eq('is_complete', false)
        .eq('payout_processed', false)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeCycle) {
        continue; // No active cycle
      }

      // Count total active approved members
      const { count: totalMembers } = await supabase
        .from('chama_members')
        .select('*', { count: 'exact', head: true })
        .eq('chama_id', chama.id)
        .eq('status', 'active')
        .eq('approval_status', 'approved');

      if (!totalMembers || totalMembers === 0) {
        continue;
      }

      // Count how many have fully paid for this cycle
      const { count: paidMembers } = await supabase
        .from('member_cycle_payments')
        .select('*', { count: 'exact', head: true })
        .eq('cycle_id', activeCycle.id)
        .eq('fully_paid', true);

      const allPaid = paidMembers !== null && paidMembers >= totalMembers;

      if (!allPaid) {
        skipped++;
        continue; // Not everyone has paid — wait for the 10 PM cron
      }

      // Check if a withdrawal already exists for this cycle
      const { data: existingWithdrawal } = await supabase
        .from('withdrawals')
        .select('id')
        .eq('chama_id', chama.id)
        .eq('cycle_id', activeCycle.id)
        .not('status', 'in', '("rejected","failed")')
        .maybeSingle();

      if (existingWithdrawal) {
        console.log(`[EARLY-PAYOUT] ${chama.name}: withdrawal already exists — skipping`);
        skipped++;
        continue;
      }

      console.log(`🚀 [EARLY-PAYOUT] ${chama.name}: ALL ${totalMembers} members paid! Triggering early payout for cycle #${activeCycle.cycle_number}`);

      // Delegate to the main daily-payout-cron which handles all the complex logic
      // We do this by calling it with the specific chama context
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/daily-payout-cron`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            earlyPayout: true,
            chamaId: chama.id,
            cycleId: activeCycle.id
          })
        });

        const result = await response.json();
        if (response.ok) {
          earlyPayoutsTriggered++;
          results.push({ chama: chama.name, cycleNumber: activeCycle.cycle_number, status: 'triggered' });
          console.log(`✅ [EARLY-PAYOUT] ${chama.name} cycle #${activeCycle.cycle_number} payout triggered successfully`);
        } else {
          console.error(`⚠️ [EARLY-PAYOUT] ${chama.name} trigger failed:`, result);
          results.push({ chama: chama.name, cycleNumber: activeCycle.cycle_number, status: 'failed', error: result.error });
        }
      } catch (triggerError) {
        console.error(`⚠️ [EARLY-PAYOUT] Error triggering payout for ${chama.name}:`, triggerError);
        results.push({ chama: chama.name, status: 'error' });
      }
    }

    console.log(`[EARLY-PAYOUT] Complete. Triggered: ${earlyPayoutsTriggered}, Skipped: ${skipped}`);

    return new Response(JSON.stringify({
      success: true,
      earlyPayoutsTriggered,
      skipped,
      totalChamas: chamas.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[EARLY-PAYOUT] Error:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
