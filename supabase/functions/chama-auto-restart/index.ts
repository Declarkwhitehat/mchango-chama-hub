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
    console.log('Running chama auto-restart check...');

    // Find chamas with cycle_complete status where last_cycle_completed_at > 48 hours ago
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: completedChamas, error: fetchError } = await supabase
      .from('chama')
      .select('*')
      .eq('status', 'cycle_complete')
      .lt('last_cycle_completed_at', fortyEightHoursAgo);

    if (fetchError) throw fetchError;

    if (!completedChamas || completedChamas.length === 0) {
      console.log('No chamas eligible for auto-restart');
      return new Response(JSON.stringify({ message: 'No chamas to restart', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let restartedCount = 0;

    for (const chama of completedChamas) {
      console.log(`Checking chama "${chama.name}" (${chama.id}) for auto-restart...`);

      // Count approved rejoin requests
      const { data: approvedRequests, error: reqError } = await supabase
        .from('chama_rejoin_requests')
        .select('*, profiles!chama_rejoin_requests_user_id_fkey(*)')
        .eq('chama_id', chama.id)
        .eq('status', 'approved');

      if (reqError) {
        console.error(`Error fetching rejoin requests for ${chama.id}:`, reqError);
        continue;
      }

      const minMembers = chama.min_members || 2;

      if (!approvedRequests || approvedRequests.length < minMembers) {
        console.log(`Chama "${chama.name}": ${approvedRequests?.length || 0}/${minMembers} approved, not enough to restart`);
        continue;
      }

      console.log(`Auto-restarting chama "${chama.name}" with ${approvedRequests.length} members`);

      // ========== CLEAN UP OLD CYCLE DATA ==========
      const { data: oldCycles } = await supabase
        .from('contribution_cycles')
        .select('id')
        .eq('chama_id', chama.id);

      const oldCycleIds = oldCycles?.map(c => c.id) || [];

      if (oldCycleIds.length > 0) {
        await supabase.from('member_cycle_payments').delete().in('cycle_id', oldCycleIds);
      }
      await supabase.from('chama_member_debts').delete().eq('chama_id', chama.id);
      await supabase.from('chama_cycle_deficits').delete().eq('chama_id', chama.id);
      await supabase.from('payout_skips').delete().eq('chama_id', chama.id);
      await supabase.from('contribution_cycles').delete().eq('chama_id', chama.id);

      // Delete old members
      await supabase
        .from('chama_members')
        .delete()
        .eq('chama_id', chama.id)
        .in('status', ['active', 'removed', 'inactive']);

      // Find the manager (original creator or first approved)
      const managerId = chama.created_by;

      // Create random order
      const memberCount = approvedRequests.length;
      const randomIndices = shuffleArray([...Array(memberCount)].map((_, i) => i + 1));

      // Ensure manager gets position in the shuffle
      const managerReqIdx = approvedRequests.findIndex(r => r.user_id === managerId);
      if (managerReqIdx !== -1) {
        const managerPos = randomIndices.indexOf(1);
        [randomIndices[managerReqIdx], randomIndices[managerPos]] = 
          [randomIndices[managerPos], randomIndices[managerReqIdx]];
      }

      // Generate unique member codes
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const existingCodes = new Set<string>();
      const memberCodes: string[] = [];
      for (let i = 0; i < approvedRequests.length; i++) {
        let code = '';
        for (let attempt = 0; attempt < 20; attempt++) {
          let suffix = '';
          for (let j = 0; j < 4; j++) {
            suffix += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          code = (chama.group_code || '') + suffix;
          if (!existingCodes.has(code)) {
            existingCodes.add(code);
            break;
          }
        }
        memberCodes.push(code);
      }

      // Create new members
      const newMembers = approvedRequests.map((r: any, idx: number) => ({
        chama_id: chama.id,
        user_id: r.user_id,
        order_index: randomIndices[idx],
        is_manager: r.user_id === managerId,
        status: 'active',
        approval_status: 'approved',
        member_code: memberCodes[idx],
        missed_payments_count: 0,
        balance_deficit: 0,
        balance_credit: 0,
        total_contributed: 0,
        carry_forward_credit: 0,
        next_cycle_credit: 0
      }));

      const { data: insertedMembers, error: insertError } = await supabase
        .from('chama_members')
        .insert(newMembers)
        .select('*, profiles!chama_members_user_id_fkey(*)');

      if (insertError) {
        console.error(`Error inserting members for ${chama.id}:`, insertError);
        continue;
      }

      // Reset chama to brand new
      await supabase
        .from('chama')
        .update({
          current_cycle_round: 1,
          accepting_rejoin_requests: false,
          status: 'active',
          start_date: new Date().toISOString(),
          total_gross_collected: 0,
          total_commission_paid: 0,
          available_balance: 0,
          total_withdrawn: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', chama.id);

      // Clean up rejoin requests
      await supabase
        .from('chama_rejoin_requests')
        .delete()
        .eq('chama_id', chama.id);

      // Send SMS notifications
      const cycleLength = getCycleLengthInDays(chama.contribution_frequency, chama.every_n_days_count);

      if (insertedMembers) {
        const smsPromises = insertedMembers
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map(async (member: any) => {
            const payoutDate = new Date();
            payoutDate.setDate(payoutDate.getDate() + (member.order_index - 1) * cycleLength);

            const message = `🔄 Your chama "${chama.name}" has automatically restarted with ${insertedMembers.length} members! You're member #${member.order_index}. Payout date: ${payoutDate.toLocaleDateString()}. KES ${chama.contribution_amount} ${chama.contribution_frequency}. 🎯`;

            try {
              await supabase.functions.invoke('send-transactional-sms', {
                body: { phone: member.profiles.phone, message, eventType: 'chama_auto_restarted' }
              });
            } catch (err) {
              console.error(`Failed SMS to ${member.profiles.phone}:`, err);
            }
          });

        await Promise.all(smsPromises);
      }

      restartedCount++;
      console.log(`Successfully auto-restarted chama "${chama.name}"`);
    }

    console.log(`Auto-restart complete. Restarted ${restartedCount} chamas.`);

    return new Response(JSON.stringify({ 
      message: 'Auto-restart complete',
      checked: completedChamas.length,
      restarted: restartedCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in chama-auto-restart:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
