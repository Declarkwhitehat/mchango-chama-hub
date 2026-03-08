import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[TRUST] Computing trust scores...');

    // Get all users who are or were chama members
    const { data: memberData, error: memberError } = await supabase
      .from('chama_members')
      .select('user_id')
      .not('user_id', 'is', null);

    if (memberError) {
      throw memberError;
    }

    const uniqueUserIds = [...new Set((memberData || []).map((m: any) => m.user_id).filter(Boolean))];
    console.log(`[TRUST] Processing ${uniqueUserIds.length} users`);

    let updated = 0;

    for (const userId of uniqueUserIds) {
      try {
        // Get all member records for this user
        const { data: memberships } = await supabase
          .from('chama_members')
          .select('id, chama_id, status, approval_status')
          .eq('user_id', userId)
          .eq('approval_status', 'approved');

        if (!memberships || memberships.length === 0) continue;

        const memberIds = memberships.map((m: any) => m.id);

        // Count completed chamas (status = 'removed' with reason 'cycle_complete' or chama status)
        const { data: completedChamas } = await supabase
          .from('chama_cycle_history')
          .select('chama_id')
          .in('chama_id', memberships.map((m: any) => m.chama_id));

        const completedChamaIds = new Set((completedChamas || []).map((c: any) => c.chama_id));
        const totalChamasCompleted = completedChamaIds.size;

        // Get all cycle payments for this user's member records
        const { data: payments } = await supabase
          .from('member_cycle_payments')
          .select('id, fully_paid, is_late_payment, is_paid')
          .in('member_id', memberIds);

        const totalPayments = (payments || []).length;
        const onTimePayments = (payments || []).filter((p: any) => p.fully_paid && !p.is_late_payment).length;
        const latePayments = (payments || []).filter((p: any) => p.fully_paid && p.is_late_payment).length;
        const missedPayments = (payments || []).filter((p: any) => !p.fully_paid && !p.is_paid).length;

        // Get outstanding debts
        const { data: debts } = await supabase
          .from('chama_member_debts')
          .select('id')
          .in('member_id', memberIds)
          .in('status', ['outstanding', 'partial']);

        const outstandingDebts = (debts || []).length;

        // Calculate trust score
        let score = 50; // base score

        if (totalPayments > 0) {
          // On-time payment ratio (70% weight)
          const onTimeRatio = onTimePayments / totalPayments;
          score = Math.round(onTimeRatio * 70);
        }

        // Completed chamas bonus (up to 20 points, 5 per completed chama)
        score += Math.min(20, totalChamasCompleted * 5);

        // Clean record bonus (10 points if no missed payments and no debts)
        if (missedPayments === 0 && outstandingDebts === 0) {
          score += 10;
        }

        score = Math.max(0, Math.min(100, score));

        // Upsert trust score
        const { error: upsertError } = await supabase
          .from('member_trust_scores')
          .upsert({
            user_id: userId,
            total_chamas_completed: totalChamasCompleted,
            total_on_time_payments: onTimePayments,
            total_late_payments: latePayments,
            total_missed_payments: missedPayments,
            total_outstanding_debts: outstandingDebts,
            trust_score: score,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error(`[TRUST] Error updating score for user ${userId}:`, upsertError);
        } else {
          updated++;
        }
      } catch (userError) {
        console.error(`[TRUST] Error processing user ${userId}:`, (userError as any).message);
      }
    }

    console.log(`[TRUST] Updated ${updated}/${uniqueUserIds.length} trust scores`);

    return new Response(JSON.stringify({
      success: true,
      processed: uniqueUserIds.length,
      updated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[TRUST] Error:', (error as any).message);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
