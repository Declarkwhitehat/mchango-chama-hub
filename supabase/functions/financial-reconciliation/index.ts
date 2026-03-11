import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const anomalies: any[] = [];

    // ═══ CHECK 1: Duplicate M-Pesa receipt numbers across contributions ═══
    const { data: dupeReceipts } = await supabase
      .from('contributions')
      .select('mpesa_receipt_number, id')
      .not('mpesa_receipt_number', 'is', null)
      .eq('status', 'completed');

    if (dupeReceipts) {
      const receiptMap = new Map<string, string[]>();
      for (const row of dupeReceipts) {
        const ids = receiptMap.get(row.mpesa_receipt_number) || [];
        ids.push(row.id);
        receiptMap.set(row.mpesa_receipt_number, ids);
      }
      for (const [receipt, ids] of receiptMap) {
        if (ids.length > 1) {
          anomalies.push({
            anomaly_type: 'duplicate_mpesa_receipt',
            entity_type: 'contribution',
            entity_id: ids[0],
            details: { receipt, duplicate_ids: ids, count: ids.length },
          });
        }
      }
    }

    // ═══ CHECK 2: Duplicate payment_reference across contributions ═══
    const { data: dupeRefs } = await supabase
      .from('contributions')
      .select('payment_reference, id')
      .eq('status', 'completed');

    if (dupeRefs) {
      const refMap = new Map<string, string[]>();
      for (const row of dupeRefs) {
        const ids = refMap.get(row.payment_reference) || [];
        ids.push(row.id);
        refMap.set(row.payment_reference, ids);
      }
      for (const [ref, ids] of refMap) {
        if (ids.length > 1) {
          anomalies.push({
            anomaly_type: 'duplicate_payment_reference',
            entity_type: 'contribution',
            entity_id: ids[0],
            details: { payment_reference: ref, duplicate_ids: ids, count: ids.length },
          });
        }
      }
    }

    // ═══ CHECK 3: Chama balance reconciliation ═══
    // For each active chama, verify available_balance matches ledger data
    const { data: chamas } = await supabase
      .from('chama')
      .select('id, name, available_balance, total_gross_collected, total_commission_paid, total_withdrawn')
      .in('status', ['active', 'started']);

    for (const chama of chamas || []) {
      // Sum all completed contributions for this chama
      const { data: contribSum } = await supabase
        .from('contributions')
        .select('amount')
        .eq('chama_id', chama.id)
        .eq('status', 'completed');

      const totalContributed = (contribSum || []).reduce((sum: number, c: any) => sum + (c.amount || 0), 0);

      // Sum all completed withdrawals
      const { data: withdrawalSum } = await supabase
        .from('withdrawals')
        .select('net_amount')
        .eq('chama_id', chama.id)
        .eq('status', 'completed');

      const totalWithdrawn = (withdrawalSum || []).reduce((sum: number, w: any) => sum + (w.net_amount || 0), 0);

      // Sum commissions from company_earnings
      const { data: commissionSum } = await supabase
        .from('company_earnings')
        .select('amount')
        .eq('group_id', chama.id);

      const totalCommissions = (commissionSum || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

      // Expected balance = contributions - commissions - withdrawals
      const expectedBalance = totalContributed - totalCommissions - totalWithdrawn;
      const actualBalance = chama.available_balance || 0;
      const drift = Math.abs(expectedBalance - actualBalance);

      if (drift > 1) { // Allow KES 1 rounding tolerance
        anomalies.push({
          anomaly_type: 'balance_drift',
          entity_type: 'chama',
          entity_id: chama.id,
          expected_value: expectedBalance,
          actual_value: actualBalance,
          difference: expectedBalance - actualBalance,
          details: {
            chama_name: chama.name,
            total_contributed: totalContributed,
            total_commissions: totalCommissions,
            total_withdrawn: totalWithdrawn,
          },
        });

        // Auto-correct if drift is small (< KES 100)
        if (drift < 100) {
          await supabase
            .from('chama')
            .update({ available_balance: expectedBalance })
            .eq('id', chama.id);

          anomalies[anomalies.length - 1].auto_corrected = true;
          console.log(`Auto-corrected balance for chama ${chama.name}: ${actualBalance} → ${expectedBalance}`);
        }
      }
    }

    // ═══ CHECK 4: Contributions exceeding expected amount ═══
    const { data: overPayments } = await supabase
      .from('contributions')
      .select('id, amount, chama_id, member_id, chama!inner(contribution_amount)')
      .eq('status', 'completed');

    for (const contrib of overPayments || []) {
      const expected = (contrib as any).chama?.contribution_amount || 0;
      // Flag if payment is more than 3x expected (likely a duplicate amount)
      if (expected > 0 && contrib.amount > expected * 3) {
        anomalies.push({
          anomaly_type: 'excessive_contribution',
          entity_type: 'contribution',
          entity_id: contrib.id,
          expected_value: expected,
          actual_value: contrib.amount,
          difference: contrib.amount - expected,
          details: { chama_id: contrib.chama_id, member_id: contrib.member_id },
        });
      }
    }

    // ═══ STORE ANOMALIES ═══
    if (anomalies.length > 0) {
      const { error: insertError } = await supabase
        .from('reconciliation_logs')
        .insert(anomalies);

      if (insertError) {
        console.error('Error storing reconciliation anomalies:', insertError);
      }
    }

    console.log(`Reconciliation complete. Found ${anomalies.length} anomalies.`);

    return new Response(
      JSON.stringify({
        success: true,
        anomalies_found: anomalies.length,
        anomalies: anomalies,
        run_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Reconciliation error:', (error as any).message);
    return new Response(
      JSON.stringify({ error: 'Reconciliation failed', details: (error as any).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
