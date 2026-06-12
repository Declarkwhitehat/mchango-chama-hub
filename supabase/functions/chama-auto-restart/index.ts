import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCycleLengthInDays(frequency: string, everyNDays?: number): number {
  switch (frequency) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'every_n_days': return everyNDays || 7;
    default: return 7;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('Running chama auto-continue check...');

    // 24h grace window after cycle close so debtors get a chance to settle
    const graceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: completedChamas, error: fetchError } = await supabase
      .from('chama')
      .select('*')
      .eq('status', 'cycle_complete')
      .lt('last_cycle_completed_at', graceCutoff);

    if (fetchError) throw fetchError;

    if (!completedChamas || completedChamas.length === 0) {
      return new Response(JSON.stringify({ message: 'No chamas to continue', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let restartedCount = 0;

    for (const chama of completedChamas) {
      console.log(`Checking chama "${chama.name}" (${chama.id}) for auto-continue...`);

      // 1) Load all approved members
      const { data: allMembers, error: memErr } = await supabase
        .from('chama_members')
        .select('id, user_id, is_manager, profiles!chama_members_user_id_fkey(phone, full_name)')
        .eq('chama_id', chama.id)
        .eq('approval_status', 'approved')
        .neq('status', 'removed');

      if (memErr || !allMembers || allMembers.length === 0) {
        console.log(`Skipping ${chama.id}: no members`);
        continue;
      }

      // 2) Identify members with outstanding debts → auto-remove
      const { data: debts } = await supabase
        .from('chama_member_debts')
        .select('member_id')
        .eq('chama_id', chama.id)
        .in('status', ['outstanding', 'partial']);

      const debtorMemberIds = new Set((debts || []).map((d: any) => d.member_id));
      const cleanMembers = allMembers.filter((m: any) => !debtorMemberIds.has(m.id));
      const removedMembers = allMembers.filter((m: any) => debtorMemberIds.has(m.id));

      // 3) Mark debtor members as removed
      if (removedMembers.length > 0) {
        await supabase
          .from('chama_members')
          .update({ status: 'removed', removed_at: new Date().toISOString(), removal_reason: 'unpaid_debt_cycle_end' })
          .in('id', removedMembers.map((m: any) => m.id));

        // Notify removed debtors
        for (const m of removedMembers) {
          const profile: any = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          if (!profile?.phone) continue;
          const message = `You have been removed from "${chama.name}" because outstanding debts were not cleared by the end of the cycle. Pay your dues to rejoin in future. STOP 4569*5#`;
          try {
            await supabase.functions.invoke('send-transactional-sms', {
              body: { phone: profile.phone, message, eventType: 'chama_member_removed_debt' }
            });
          } catch (_e) { /* ignore */ }
        }
      }

      const minMembers = chama.min_members || 2;
      if (cleanMembers.length < minMembers) {
        console.log(`Chama "${chama.name}": only ${cleanMembers.length} debt-free members (need ${minMembers}). Leaving in cycle_complete.`);
        continue;
      }

      // 4) Clean prior-cycle transactional data, but PRESERVE clean members
      const { data: oldCycles } = await supabase
        .from('contribution_cycles')
        .select('id')
        .eq('chama_id', chama.id);
      const oldCycleIds = oldCycles?.map((c: any) => c.id) || [];
      if (oldCycleIds.length > 0) {
        await supabase.from('member_cycle_payments').delete().in('cycle_id', oldCycleIds);
      }
      await supabase.from('chama_member_debts').delete().eq('chama_id', chama.id);
      await supabase.from('chama_cycle_deficits').delete().eq('chama_id', chama.id);
      await supabase.from('payout_skips').delete().eq('chama_id', chama.id);
      await supabase.from('contribution_cycles').delete().eq('chama_id', chama.id);

      // 5) Reshuffle payout order for the continuing members
      const randomOrder = shuffleArray(cleanMembers);
      const updates = randomOrder.map((m: any, idx: number) => ({
        id: m.id,
        order_index: idx + 1,
      }));

      for (const u of updates) {
        await supabase
          .from('chama_members')
          .update({
            order_index: u.order_index,
            missed_payments_count: 0,
            balance_deficit: 0,
            balance_credit: 0,
            total_contributed: 0,
            carry_forward_credit: 0,
            next_cycle_credit: 0,
            status: 'active',
          })
          .eq('id', u.id);
      }

      // 6) Reset chama to active and bump round
      await supabase
        .from('chama')
        .update({
          current_cycle_round: (chama.current_cycle_round || 1) + 1,
          accepting_rejoin_requests: false,
          status: 'active',
          start_date: new Date().toISOString(),
          total_gross_collected: 0,
          total_commission_paid: 0,
          available_balance: 0,
          total_withdrawn: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', chama.id);

      // Drop any stale rejoin requests (no longer required)
      await supabase.from('chama_rejoin_requests').delete().eq('chama_id', chama.id);

      // 7) SMS the continuing members
      const cycleLength = getCycleLengthInDays(chama.contribution_frequency, chama.every_n_days_count);
      for (const m of randomOrder) {
        const profile: any = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        if (!profile?.phone) continue;
        const pos = updates.find((u) => u.id === m.id)?.order_index || 1;
        const payoutDate = new Date();
        payoutDate.setDate(payoutDate.getDate() + (pos - 1) * cycleLength);
        const message = `"${chama.name}" has automatically continued into a new cycle. You are member #${pos}. Payout date: ${payoutDate.toLocaleDateString()}. Contribute KES ${chama.contribution_amount} ${chama.contribution_frequency}. STOP 4569*5#`;
        try {
          await supabase.functions.invoke('send-transactional-sms', {
            body: { phone: profile.phone, message, eventType: 'chama_auto_continued' }
          });
        } catch (_e) { /* ignore */ }
      }

      restartedCount++;
      console.log(`Auto-continued "${chama.name}" with ${cleanMembers.length} members, removed ${removedMembers.length} debtors.`);
    }

    return new Response(JSON.stringify({
      message: 'Auto-continue complete',
      checked: completedChamas.length,
      restarted: restartedCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in chama-auto-restart:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
