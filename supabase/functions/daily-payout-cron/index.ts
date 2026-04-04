import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const celcomApiKey = Deno.env.get('CELCOM_API_KEY');
const celcomPartnerId = Deno.env.get('CELCOM_PARTNER_ID');
const celcomShortcode = Deno.env.get('CELCOM_SHORTCODE');

async function sendSMS(phone: string, message: string) {
  if (!celcomApiKey || !celcomPartnerId || !celcomShortcode) {
    console.error('SMS credentials not configured');
    return { success: false, error: 'SMS not configured' };
  }

  try {
    const response = await fetch('https://api.celcomafrica.com/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${celcomApiKey}`
      },
      body: JSON.stringify({
        partnerID: celcomPartnerId,
        shortCode: celcomShortcode,
        mobile: phone.startsWith('254') ? phone : `254${phone.replace(/^0+/, '')}`,
        message: message
      })
    });

    const data = await response.json();
    return { success: response.ok, messageId: data.messageId };
  } catch (error: any) {
    console.error('SMS error:', error);
    return { success: false, error: error.message };
  }
}

// Check if a member is eligible for payout based on PER-CYCLE payment records
async function checkMemberEligibility(supabase: any, memberId: string, chamaId: string, contributionAmount: number, orderIndex: number) {
  const { data: cyclePayments, error } = await supabase
    .from('member_cycle_payments')
    .select(`
      id,
      cycle_id,
      amount_due,
      amount_paid,
      fully_paid,
      contribution_cycles!inner(cycle_number, start_date, end_date, payout_processed)
    `)
    .eq('member_id', memberId)
    .order('contribution_cycles(start_date)', { ascending: true });

  if (error) {
    console.error('Error fetching cycle payments:', error);
    return { isEligible: false, required: 0, contributed: 0, shortfall: 0, unpaidCycles: 0 };
  }

  const unpaidCycles = (cyclePayments || []).filter((p: any) => !p.fully_paid);
  const totalUnpaid = unpaidCycles.reduce((sum: number, p: any) => sum + ((p.amount_due || contributionAmount) - (p.amount_paid || 0)), 0);
  const totalPaidCycles = (cyclePayments || []).filter((p: any) => p.fully_paid).length;
  const totalCycles = (cyclePayments || []).length;

  // Also check outstanding debts
  const { data: outstandingDebts } = await supabase
    .from('chama_member_debts')
    .select('id')
    .eq('member_id', memberId)
    .eq('chama_id', chamaId)
    .in('status', ['outstanding', 'partial'])
    .limit(1);

  const hasDebts = (outstandingDebts && outstandingDebts.length > 0);

  const isEligible = unpaidCycles.length === 0 && totalCycles > 0 && !hasDebts;

  return {
    isEligible,
    required: totalCycles * contributionAmount,
    contributed: totalPaidCycles * contributionAmount,
    shortfall: totalUnpaid,
    unpaidCycles: unpaidCycles.length,
    hasDebts
  };
}

async function findNextEligibleMember(supabase: any, chamaId: string, contributionAmount: number, startPosition: number) {
  const { data: members, error } = await supabase
    .from('chama_members')
    .select(`
      id,
      order_index,
      member_code,
      user_id,
      missed_payments_count,
      requires_admin_verification,
      was_skipped,
      profiles!chama_members_user_id_fkey(full_name, phone)
    `)
    .eq('chama_id', chamaId)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .gte('order_index', startPosition)
    .order('order_index', { ascending: true });

  if (error || !members) {
    console.error('Error finding eligible members:', error);
    return null;
  }

  for (const member of members) {
    const eligibility = await checkMemberEligibility(
      supabase, 
      member.id, 
      chamaId, 
      contributionAmount, 
      member.order_index
    );

    if (eligibility.isEligible) {
      return { member, eligibility };
    }
  }

  return null;
}

async function recordPayoutSkip(
  supabase: any, 
  chamaId: string, 
  memberId: string, 
  cycleId: string, 
  originalPosition: number, 
  newPosition: number | null,
  amountOwed: number,
  amountPaid: number,
  reason: string
) {
  const { error } = await supabase
    .from('payout_skips')
    .insert({
      chama_id: chamaId,
      member_id: memberId,
      cycle_id: cycleId,
      original_position: originalPosition,
      new_position: newPosition,
      amount_owed: amountOwed,
      amount_paid: amountPaid,
      skip_reason: reason,
      notification_sent: false
    });

  if (error) {
    console.error('Error recording payout skip:', error);
  }

  return !error;
}

/**
 * Phase I – Consequence Management:
 * Create debt and deficit records for each member who did NOT pay this cycle.
 */
async function accrueDebtsForCycle(
  supabase: any,
  chamaId: string,
  cycleId: string,
  cycleNumber: number,
  beneficiaryMemberId: string,
  unpaidPayments: any[],
  contributionAmount: number,
  commissionRate: number
) {
  if (unpaidPayments.length === 0) return;

  const LATE_PENALTY_RATE = 0.10;
  const isSelfInflicted = unpaidPayments.length === 1 && unpaidPayments[0].member_id === beneficiaryMemberId;

  for (const payment of unpaidPayments) {
    const memberId = payment.member_id || payment.chama_members?.id;
    if (!memberId) continue;

    const principalDebt = contributionAmount;
    const penaltyDebt = contributionAmount * LATE_PENALTY_RATE;

    // Check if debt already exists for this member+cycle to prevent duplicates
    const { data: existingDebt } = await supabase
      .from('chama_member_debts')
      .select('id')
      .eq('member_id', memberId)
      .eq('cycle_id', cycleId)
      .maybeSingle();

    if (existingDebt) {
      console.log(`ℹ️ Debt already exists for member ${memberId} cycle ${cycleId} — skipping`);
      continue;
    }

    const { data: debt, error: debtError } = await supabase
      .from('chama_member_debts')
      .insert({
        chama_id: chamaId,
        member_id: memberId,
        cycle_id: cycleId,
        principal_debt: principalDebt,
        penalty_debt: penaltyDebt,
        principal_remaining: principalDebt,
        penalty_remaining: penaltyDebt,
        status: 'outstanding',
        payment_allocations: JSON.stringify([{
          event: 'debt_accrued',
          cycle_number: cycleNumber,
          principal: principalDebt,
          penalty: penaltyDebt,
          timestamp: new Date().toISOString()
        }])
      })
      .select('id')
      .single();

    if (debtError) {
      console.error(`Error creating debt for member ${memberId}:`, debtError);
      continue;
    }

    console.log(`✅ Debt created for member ${memberId}: KES ${principalDebt} principal + KES ${penaltyDebt} penalty`);

    // Audit log for debt accrual
    await supabase.from('audit_logs').insert({
      action: 'DEBT_ACCRUED',
      table_name: 'chama_member_debts',
      record_id: debt.id,
      new_values: { member_id: memberId, cycle_id: cycleId, principal: principalDebt, penalty: penaltyDebt }
    });

    if (isSelfInflicted) {
      console.log(`ℹ️ Self-inflicted deficit detected — no deficit record created for member ${memberId}`);
      continue;
    }

    const netOwedToRecipient = principalDebt * (1 - commissionRate);

    const { error: deficitError } = await supabase
      .from('chama_cycle_deficits')
      .insert({
        chama_id: chamaId,
        cycle_id: cycleId,
        recipient_member_id: beneficiaryMemberId,
        non_payer_member_id: memberId,
        debt_id: debt.id,
        principal_amount: principalDebt,
        commission_rate: commissionRate,
        net_owed_to_recipient: netOwedToRecipient,
        status: 'outstanding'
      });

    if (deficitError) {
      console.error(`Error creating deficit for member ${memberId}:`, deficitError);
    } else {
      console.log(`✅ Deficit created: recipient ${beneficiaryMemberId} is owed KES ${netOwedToRecipient.toFixed(2)} from member ${memberId}`);
      
      // Audit log for deficit creation
      await supabase.from('audit_logs').insert({
        action: 'DEFICIT_CREATED',
        table_name: 'chama_cycle_deficits',
        record_id: cycleId,
        new_values: { recipient: beneficiaryMemberId, non_payer: memberId, net_owed: netOwedToRecipient }
      });
    }

    const memberPhone = payment.chama_members?.profiles?.phone;
    if (memberPhone) {
      const totalOwed = principalDebt + penaltyDebt;
      await sendSMS(memberPhone,
        `⚠️ You missed a payment. Debt accrued: KES ${principalDebt} (principal) + KES ${penaltyDebt} (10% penalty) = KES ${totalOwed.toFixed(2)} outstanding. Pay now to clear your balance.`
      );
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[CRON] Daily payout started at:', new Date().toISOString());

    const { data: chamas, error: chamasError } = await supabase
      .from('chama')
      .select('id, name, contribution_amount, commission_rate, contribution_frequency, current_cycle_round, created_at, every_n_days_count, monthly_contribution_day, monthly_contribution_day_2')
      .eq('status', 'active');

    if (chamasError) {
      console.error('Error fetching chamas:', chamasError);
      return new Response(JSON.stringify({ error: chamasError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let payoutsProcessed = 0;
    let skipsProcessed = 0;
    let errors = 0;

    for (const chama of chamas || []) {
      const now = new Date().toISOString();
      
      // ========== GAP RECOVERY: Create missing cycles ==========
      const { data: latestCycle } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number, end_date, payout_processed')
        .eq('chama_id', chama.id)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestCycle && latestCycle.payout_processed) {
        const latestEndDate = new Date(latestCycle.end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (latestEndDate < today) {
          const { data: activeMembers } = await supabase
            .from('chama_members')
            .select('id, order_index, carry_forward_credit, next_cycle_credit')
            .eq('chama_id', chama.id)
            .eq('approval_status', 'approved')
            .eq('status', 'active')
            .order('order_index');

          if (activeMembers && activeMembers.length > 0) {
            let lastEndDate = latestEndDate;
            let lastCycleNum = latestCycle.cycle_number;
            let cyclesCreated = 0;

            // Count total existing cycles (not just latest cycle_number)
            const { count: existingCycleCount } = await supabase
              .from('contribution_cycles')
              .select('*', { count: 'exact', head: true })
              .eq('chama_id', chama.id);

            const maxTotalCycles = activeMembers.length; // Single round ROSCA
            const remainingCycles = maxTotalCycles - (existingCycleCount || 0);
            const MAX_CATCHUP_CYCLES = Math.min(50, remainingCycles);

            // If all members already had their turn, mark chama as cycle_complete
            if (MAX_CATCHUP_CYCLES <= 0) {
              console.log(`[GAP RECOVERY] All ${activeMembers.length} members have had their turn in ${chama.name}. Marking as cycle_complete.`);
              await supabase.from('chama').update({
                status: 'cycle_complete',
                last_cycle_completed_at: new Date().toISOString(),
                accepting_rejoin_requests: true
              }).eq('id', chama.id);
              continue;
            }

            while (cyclesCreated < MAX_CATCHUP_CYCLES) {
              const nextStart = new Date(lastEndDate);
              nextStart.setDate(nextStart.getDate() + 1);
              nextStart.setHours(0, 0, 0, 0);
              
              if (nextStart > today) break;

              const nextEnd = new Date(nextStart);
              switch (chama.contribution_frequency) {
                case 'daily':
                  nextEnd.setHours(22, 0, 0, 0);
                  break;
                case 'weekly':
                  nextEnd.setDate(nextEnd.getDate() + 6);
                  nextEnd.setHours(23, 59, 59, 999);
                  break;
                case 'monthly':
                  if (chama.monthly_contribution_day) {
                    nextEnd.setMonth(nextEnd.getMonth() + 1);
                    nextEnd.setDate(chama.monthly_contribution_day - 1);
                  } else {
                    nextEnd.setMonth(nextEnd.getMonth() + 1);
                    nextEnd.setDate(0);
                  }
                  nextEnd.setHours(23, 59, 59, 999);
                  break;
                case 'twice_monthly':
                  if (chama.monthly_contribution_day && chama.monthly_contribution_day_2) {
                    const d1 = Math.min(chama.monthly_contribution_day, chama.monthly_contribution_day_2);
                    const d2 = Math.max(chama.monthly_contribution_day, chama.monthly_contribution_day_2);
                    const curDay = nextStart.getDate();
                    if (curDay >= d1 && curDay < d2) {
                      nextEnd.setDate(d2 - 1);
                    } else {
                      if (curDay >= d2) nextEnd.setMonth(nextEnd.getMonth() + 1);
                      nextEnd.setDate(d1 - 1);
                    }
                  } else {
                    nextEnd.setDate(nextEnd.getDate() + 14);
                  }
                  nextEnd.setHours(23, 59, 59, 999);
                  break;
                case 'every_n_days':
                  nextEnd.setDate(nextEnd.getDate() + (chama.every_n_days_count || 7) - 1);
                  nextEnd.setHours(23, 59, 59, 999);
                  break;
                default:
                  nextEnd.setDate(nextEnd.getDate() + 6);
                  nextEnd.setHours(23, 59, 59, 999);
              }

              const nextCycleNum = lastCycleNum + 1;
              const beneficiaryIndex = (nextCycleNum - 1) % activeMembers.length;
              const beneficiary = activeMembers[beneficiaryIndex];

              const { data: newCycle, error: cycleErr } = await supabase
                .from('contribution_cycles')
                .insert({
                  chama_id: chama.id,
                  cycle_number: nextCycleNum,
                  start_date: nextStart.toISOString(),
                  end_date: nextEnd.toISOString(),
                  due_amount: chama.contribution_amount,
                  beneficiary_member_id: beneficiary.id,
                  is_complete: false,
                  payout_processed: true,
                  payout_processed_at: nextEnd.toISOString(),
                  payout_type: 'none',
                  payout_amount: 0,
                  members_paid_count: 0,
                  members_skipped_count: activeMembers.length
                })
                .select('id')
                .single();

              if (cycleErr) {
                console.error(`Gap recovery: Error creating cycle ${nextCycleNum}:`, cycleErr);
                break;
              }

              const paymentRecords = activeMembers.map((m: any) => ({
                member_id: m.id,
                cycle_id: newCycle.id,
                amount_due: chama.contribution_amount,
                amount_paid: 0,
                amount_remaining: chama.contribution_amount,
                is_paid: false,
                fully_paid: false,
                is_late_payment: false,
                payment_allocations: []
              }));

              await supabase.from('member_cycle_payments').insert(paymentRecords);

              // ========== GAP RECOVERY: Track missed payments + auto-remove ==========
              for (const member of activeMembers) {
                const currentMissed = member.missed_payments_count || 0;
                const newMissedCount = currentMissed + 1;
                const totalOutstanding = newMissedCount * chama.contribution_amount;

                await supabase.from('chama_members').update({
                  missed_payments_count: newMissedCount,
                  requires_admin_verification: newMissedCount >= 1,
                  balance_deficit: totalOutstanding
                }).eq('id', member.id);

                // Update local reference for subsequent iterations
                member.missed_payments_count = newMissedCount;

                if (newMissedCount >= 3) {
                  console.log(`🚫 [GAP RECOVERY] AUTO-REMOVING member ${member.id} - ${newMissedCount} missed payments`);

                  const { data: memberProfile } = await supabase
                    .from('chama_members')
                    .select('member_code, user_id, is_manager, profiles!chama_members_user_id_fkey(full_name, phone)')
                    .eq('id', member.id)
                    .single();

                  await supabase.from('chama_member_removals').insert({
                    chama_id: chama.id,
                    member_id: member.id,
                    user_id: memberProfile?.user_id,
                    removal_reason: `Auto-removed (gap recovery): ${newMissedCount} consecutive missed payments. Outstanding: KES ${totalOutstanding}`,
                    chama_name: chama.name,
                    member_name: memberProfile?.profiles?.full_name,
                    member_phone: memberProfile?.profiles?.phone,
                    was_manager: memberProfile?.is_manager || false,
                    removed_at: new Date().toISOString()
                  });

                  await supabase.from('chama_members').update({
                    status: 'removed',
                    removal_reason: `Auto-removed: ${newMissedCount} consecutive missed payments`,
                    removed_at: new Date().toISOString()
                  }).eq('id', member.id);
                }
              }

              console.log(`[GAP RECOVERY] Created cycle ${nextCycleNum} for ${chama.name} (${nextStart.toISOString().split('T')[0]})`);
              
              lastEndDate = nextEnd;
              lastCycleNum = nextCycleNum;
              cyclesCreated++;
            }

            if (cyclesCreated > 0) {
              console.log(`[GAP RECOVERY] Created ${cyclesCreated} missing cycles for ${chama.name}`);
              // Resequence after potential removals
              await supabase.rpc('resequence_member_order', { p_chama_id: chama.id });
            }
          }
        }
      }

      // ========== NORMAL PROCESSING: Fetch overdue cycles ==========
      const { data: pendingCycles } = await supabase
        .from('contribution_cycles')
        .select(`
          *,
          beneficiary:chama_members!beneficiary_member_id(
            id,
            member_code,
            user_id,
            order_index,
            missed_payments_count,
            requires_admin_verification,
            payout_deferred_count,
            profiles!chama_members_user_id_fkey(full_name, phone)
          )
        `)
        .eq('chama_id', chama.id)
        .lte('end_date', now)
        .eq('payout_processed', false)
        .order('cycle_number', { ascending: true })
        .limit(5);

      if (!pendingCycles || pendingCycles.length === 0) {
        console.log(`No unprocessed cycle for chama ${chama.name}`);
        continue;
      }

      console.log(`[CATCH-UP] Processing ${pendingCycles.length} overdue cycle(s) for ${chama.name}`);

      for (const cycle of pendingCycles) {
        console.log(`  Processing cycle #${cycle.cycle_number} (${cycle.start_date} - ${cycle.end_date})`);

        // ========== ROW-LEVEL LOCK: Claim cycle for processing ==========
        const { data: claimed } = await supabase
          .rpc('claim_cycle_for_processing', { p_cycle_id: cycle.id });

        if (!claimed) {
          console.log(`⚠️ Cycle ${cycle.id} already claimed by another process — skipping`);
          continue;
        }

        // ========== DUPLICATE PAYOUT GUARD ==========
        const { data: existingWithdrawal } = await supabase
          .from('withdrawals')
          .select('id, status')
          .eq('chama_id', chama.id)
          .eq('cycle_id', cycle.id)
          .not('status', 'in', '("rejected","failed")')
          .maybeSingle();

        if (existingWithdrawal) {
          console.log(`⚠️ Withdrawal already exists for cycle ${cycle.id} (${existingWithdrawal.id}) — skipping payout creation`);
          // Still process debts and next cycle creation below
        }

        const scheduledBeneficiary = cycle.beneficiary;
        const eligibility = await checkMemberEligibility(
          supabase,
          scheduledBeneficiary.id,
          chama.id,
          chama.contribution_amount,
          scheduledBeneficiary.order_index
        );

        let actualBeneficiary = scheduledBeneficiary;
        let wasSkipped = false;
        let skipPayout = false;

        if (!eligibility.isEligible) {
          console.log(`⚠️ Member ${scheduledBeneficiary.member_code} NOT ELIGIBLE for payout. Details: ${eligibility.unpaidCycles} unpaid cycle(s), shortfall KES ${eligibility.shortfall}, has outstanding debts: ${eligibility.hasDebts}, missed_payments_count: ${scheduledBeneficiary.missed_payments_count || 0}`);
          
          // Detailed audit log for eligibility failure
          await supabase.from('audit_logs').insert({
            action: 'PAYOUT_ELIGIBILITY_FAILED',
            table_name: 'chama_members',
            record_id: scheduledBeneficiary.id,
            new_values: {
              chama_id: chama.id,
              cycle_id: cycle.id,
              cycle_number: cycle.cycle_number,
              member_code: scheduledBeneficiary.member_code,
              unpaid_cycles: eligibility.unpaidCycles,
              shortfall: eligibility.shortfall,
              total_required: eligibility.required,
              total_contributed: eligibility.contributed,
              has_outstanding_debts: eligibility.hasDebts,
              missed_payments_count: scheduledBeneficiary.missed_payments_count || 0
            }
          });
          wasSkipped = true;

          const { data: maxOrderResult } = await supabase
            .from('chama_members')
            .select('order_index')
            .eq('chama_id', chama.id)
            .eq('status', 'active')
            .eq('approval_status', 'approved')
            .order('order_index', { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastPosition = maxOrderResult?.order_index || scheduledBeneficiary.order_index;
          // Cap newPosition to member count — can't go beyond the total number of active members
          const { count: activeMemberCount } = await supabase
            .from('chama_members')
            .select('*', { count: 'exact', head: true })
            .eq('chama_id', chama.id)
            .eq('status', 'active')
            .eq('approval_status', 'approved');
          const newPosition = Math.min(lastPosition + 1, activeMemberCount || lastPosition + 1);

          await recordPayoutSkip(
            supabase,
            chama.id,
            scheduledBeneficiary.id,
            cycle.id,
            scheduledBeneficiary.order_index,
            newPosition,
            eligibility.shortfall,
            eligibility.contributed,
            `Incomplete cycle payments: ${eligibility.unpaidCycles} unpaid cycle(s), shortfall KES ${eligibility.shortfall}. Moved to position ${newPosition}.`
          );

          const currentDeferredCount = scheduledBeneficiary.payout_deferred_count || 0;
          await supabase
            .from('chama_members')
            .update({
              was_skipped: true,
              skipped_at: new Date().toISOString(),
              skip_reason: `Payout deferred: ${eligibility.unpaidCycles} unpaid cycle(s), shortfall KES ${eligibility.shortfall}`,
              contribution_status: 'skipped',
              rescheduled_to_position: newPosition,
              payout_deferred_count: currentDeferredCount + 1
            })
            .eq('id', scheduledBeneficiary.id);

          await supabase.rpc('resequence_member_order', { p_chama_id: chama.id });
          await supabase.rpc('calculate_expected_contributions', { p_chama_id: chama.id });

          console.log(`🔄 Member ${scheduledBeneficiary.member_code} moved from position ${scheduledBeneficiary.order_index} → ${newPosition} (deferred ${currentDeferredCount + 1} time(s))`);

          // Audit log for skip
          await supabase.from('audit_logs').insert({
            action: 'PAYOUT_DEFERRED',
            table_name: 'chama_members',
            record_id: scheduledBeneficiary.id,
            old_values: { order_index: scheduledBeneficiary.order_index, payout_deferred_count: currentDeferredCount },
            new_values: { rescheduled_to_position: newPosition, payout_deferred_count: currentDeferredCount + 1, skip_reason: `${eligibility.unpaidCycles} unpaid cycle(s), shortfall KES ${eligibility.shortfall}` }
          });

          const skipPhone = scheduledBeneficiary.profiles?.phone;
          if (skipPhone) {
            await sendSMS(skipPhone, `⚠️ Your chama "${chama.name}" payout was POSTPONED today. Reason: ${eligibility.unpaidCycles} unpaid cycle(s). Outstanding: KES ${eligibility.shortfall}. You've been moved to position ${newPosition} in the queue. Clear your payments to restore eligibility.`);
          }

          if (scheduledBeneficiary.user_id) {
            await supabase.from('notifications').insert({
              user_id: scheduledBeneficiary.user_id,
              title: 'Payout Postponed',
              message: `Your payout for "${chama.name}" was postponed. You've been moved to position ${newPosition}. Outstanding: KES ${eligibility.shortfall}. Clear your payments to be eligible.`,
              type: 'warning',
              category: 'chama',
              related_entity_id: chama.id,
              related_entity_type: 'chama'
            });
          }

          skipsProcessed++;

          const nextEligible = await findNextEligibleMember(
            supabase,
            chama.id,
            chama.contribution_amount,
            scheduledBeneficiary.order_index + 1
          );

          if (!nextEligible) {
            // No eligible member found — create admin approval request
            console.log(`⚠️ No eligible member for payout in ${chama.name} cycle #${cycle.cycle_number}. Creating admin approval request.`);

            // Gather all members with eligibility info for admin context
            const { data: allMembers } = await supabase
              .from('chama_members')
              .select('id, member_code, order_index, missed_payments_count, user_id, was_skipped, profiles!chama_members_user_id_fkey(full_name)')
              .eq('chama_id', chama.id)
              .eq('status', 'active')
              .eq('approval_status', 'approved')
              .order('order_index');

            const ineligibleDetails: any[] = [];
            for (const m of (allMembers || [])) {
              const elig = await checkMemberEligibility(supabase, m.id, chama.id, chama.contribution_amount, m.order_index);
              if (!elig.isEligible) {
                ineligibleDetails.push({
                  member_id: m.id,
                  member_code: m.member_code,
                  name: m.profiles?.full_name || 'Unknown',
                  unpaid_cycles: elig.unpaidCycles,
                  shortfall: elig.shortfall,
                  has_debts: elig.hasDebts,
                  missed_payments: m.missed_payments_count || 0,
                });
              }
            }

            // Get pool balance for payout amount
            const { data: chamaPoolForApproval } = await supabase
              .from('chama')
              .select('available_balance')
              .eq('id', chama.id)
              .single();

            const approvalPayoutAmount = chamaPoolForApproval?.available_balance || 0;

            // Skip creating approval request if there's nothing to pay out
            if (approvalPayoutAmount <= 0) {
              console.log(`ℹ️ Skipping admin approval for ${chama.name} cycle #${cycle.cycle_number} — KES 0 payout`);
              await supabase.from('contribution_cycles').update({
                payout_amount: 0,
                payout_type: 'none',
                members_skipped_count: ineligibleDetails.length
              }).eq('id', cycle.id);
              skipPayout = true;
            }

            // Create the approval request only if there's money to distribute
            const { data: approvalReq, error: approvalError } = approvalPayoutAmount > 0 ? await supabase
              .from('payout_approval_requests')
              .insert({
                chama_id: chama.id,
                cycle_id: cycle.id,
                scheduled_beneficiary_id: scheduledBeneficiary.id,
                payout_amount: approvalPayoutAmount,
                reason: `No eligible beneficiary found for Cycle #${cycle.cycle_number}. Scheduled beneficiary (${scheduledBeneficiary.member_code}) and all subsequent members are ineligible. ${ineligibleDetails.length} member(s) have outstanding issues.`,
                ineligible_members: ineligibleDetails,
                status: 'pending',
              })
              .select('id')
              .single() : { data: null, error: null };

            if (approvalError) {
              if (approvalError.code === '23505') {
                console.log(`ℹ️ Approval request already exists for cycle ${cycle.id}`);
              } else {
                console.error('Error creating approval request:', approvalError);
              }
            } else {
              console.log(`📋 Admin approval request created: ${approvalReq?.id}`);

              // Notify admins
              const { data: adminUsers } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('role', 'admin');

              for (const admin of (adminUsers || [])) {
                await supabase.from('notifications').insert({
                  user_id: admin.user_id,
                  title: 'Payout Approval Required',
                  message: `Chama "${chama.name}" Cycle #${cycle.cycle_number}: No eligible beneficiary found. ${ineligibleDetails.length} member(s) ineligible. Available balance: KES ${approvalPayoutAmount.toFixed(2)}. Please review and assign a beneficiary.`,
                  type: 'warning',
                  category: 'admin',
                  related_entity_id: chama.id,
                  related_entity_type: 'chama',
                });
              }

              // Notify chama manager
              const { data: managers } = await supabase
                .from('chama_members')
                .select('user_id')
                .eq('chama_id', chama.id)
                .eq('is_manager', true)
                .eq('status', 'active');

              for (const mgr of (managers || [])) {
                await supabase.from('notifications').insert({
                  user_id: mgr.user_id,
                  title: 'Payout Review Pending',
                  message: `Your chama "${chama.name}" Cycle #${cycle.cycle_number} payout is pending admin review. No eligible member was found automatically.`,
                  type: 'info',
                  category: 'chama',
                  related_entity_id: chama.id,
                  related_entity_type: 'chama',
                });
              }
            }

            // Still update cycle metadata
            await supabase
              .from('contribution_cycles')
              .update({
                payout_amount: 0,
                payout_type: 'pending_approval',
                members_skipped_count: ineligibleDetails.length
              })
              .eq('id', cycle.id);

            skipPayout = true;
          } else {
            actualBeneficiary = nextEligible.member;
          }
        }

        // ========== PAYMENT DATA ==========
        const { data: payments } = await supabase
          .from('member_cycle_payments')
          .select('*, chama_members!member_id(*, profiles!chama_members_user_id_fkey(full_name, phone))')
          .eq('cycle_id', cycle.id);

        const totalMembers = payments?.length || 0;
        const paidOnTimeMembers = payments?.filter((p: any) => p.fully_paid && !p.is_late_payment) || [];
        const paidLateMembers = payments?.filter((p: any) => p.fully_paid && p.is_late_payment) || [];
        const allFullyPaidMembers = payments?.filter((p: any) => p.fully_paid) || [];
        const paidCount = allFullyPaidMembers.length;
        const unpaidMembers = payments?.filter((p: any) => !p.fully_paid) || [];

        if (!skipPayout && !existingWithdrawal) {
          // Use available_balance as source of truth — commission already deducted per-contribution
          const { data: chamaPoolBalance } = await supabase
            .from('chama')
            .select('available_balance')
            .eq('id', chama.id)
            .single();

          const poolBalance = chamaPoolBalance?.available_balance || 0;
          const totalCommission = 0; // Already collected per-contribution in settleDebts()
          const payoutAmount = poolBalance;
          const collectedAmount = poolBalance; // For ledger entry: pool is net

          // Balance sufficiency check
          if (poolBalance <= 0) {
            console.warn(`⚠️ Chama ${chama.name} has zero available_balance — skipping payout for cycle ${cycle.cycle_number}`);
            await supabase.from('audit_logs').insert({
              action: 'PAYOUT_SKIPPED_NO_BALANCE',
              table_name: 'contribution_cycles',
              record_id: cycle.id,
              new_values: { chama_id: chama.id, available_balance: poolBalance, cycle_number: cycle.cycle_number }
            });
          }

          const isFullPayout = paidCount === totalMembers;
          const payoutType = wasSkipped ? 'partial' : (isFullPayout ? 'full' : 'partial');

          console.log(`Processing ${payoutType} payout for ${chama.name}: ${paidCount}/${totalMembers} paid, net: KES ${payoutAmount}`);

          const { data: paymentMethod } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('user_id', actualBeneficiary.user_id)
            .eq('is_default', true)
            .maybeSingle();

          if (!paymentMethod && payoutAmount > 0) {
            console.error(`No payment method for beneficiary ${actualBeneficiary.member_code}`);
            errors++;
          } else {
            if (payoutAmount > 0) {
              const canAutoApprove = paymentMethod?.method_type === 'mpesa' && 
                                     !actualBeneficiary.requires_admin_verification &&
                                     (actualBeneficiary.missed_payments_count || 0) === 0;
              
              const withdrawalStatus = canAutoApprove ? 'approved' : 'pending';

              const { data: newWithdrawal, error: withdrawalError } = await supabase
                .from('withdrawals')
                .insert({
                  chama_id: chama.id,
                  cycle_id: cycle.id,  // Link to cycle for duplicate prevention
                  requested_by: actualBeneficiary.user_id,
                  amount: collectedAmount,
                  commission_amount: totalCommission,
                  net_amount: payoutAmount,
                  status: withdrawalStatus,
                  payment_method_id: paymentMethod?.id,
                  payment_method_type: paymentMethod?.method_type,
                  notes: `${wasSkipped ? `Redirected payout (${scheduledBeneficiary.member_code} skipped). ` : ''}${payoutType} (${paidCount}/${totalMembers} paid) | Cycle #${cycle.cycle_number}`,
                  requested_at: new Date().toISOString(),
                  b2c_attempt_count: 0,
                  ...(withdrawalStatus === 'approved' ? { reviewed_at: new Date().toISOString() } : {})
                })
                .select('id')
                .single();

              if (withdrawalError) {
                // Check if it's a duplicate key violation (unique index)
                if (withdrawalError.code === '23505') {
                  console.log(`⚠️ Duplicate payout prevented for cycle ${cycle.id} — unique index caught it`);
                } else {
                  console.error('Error creating withdrawal:', withdrawalError);
                  errors++;
                }
              } else if (newWithdrawal) {
                // Commission already collected per-contribution in settleDebts() — no double-charge

                // ========== PAYOUT LEDGER ENTRY ==========
                await supabase.from('financial_ledger').insert({
                  transaction_type: 'payout',
                  source_type: 'chama',
                  source_id: chama.id,
                  gross_amount: collectedAmount,
                  commission_amount: totalCommission,
                  net_amount: payoutAmount,
                  commission_rate: collectedAmount > 0 ? totalCommission / collectedAmount : 0.05,
                  reference_id: newWithdrawal.id,
                  description: `Cycle #${cycle.cycle_number} ${payoutType} payout to ${actualBeneficiary.member_code}. ${paidCount}/${totalMembers} paid.`
                });

                // Audit log for payout
                await supabase.from('audit_logs').insert({
                  action: 'PAYOUT_CREATED',
                  table_name: 'withdrawals',
                  record_id: newWithdrawal.id,
                  new_values: {
                    cycle_id: cycle.id,
                    cycle_number: cycle.cycle_number,
                    beneficiary: actualBeneficiary.member_code,
                    gross: collectedAmount,
                    commission: totalCommission,
                    net: payoutAmount,
                    payout_type: payoutType,
                    was_redirected: wasSkipped
                  }
                });

                if (canAutoApprove && newWithdrawal && paymentMethod?.phone_number) {
                  const beneficiaryPhone = actualBeneficiary.profiles?.phone || paymentMethod.phone_number;
                  if (beneficiaryPhone) {
                    await sendSMS(beneficiaryPhone, 
                      `💰 Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} is being processed. You should receive it within 2 minutes.`
                    );
                  }

                  try {
                    const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        withdrawal_id: newWithdrawal.id,
                        phone_number: paymentMethod.phone_number,
                        amount: payoutAmount
                      })
                    });

                    const b2cResult = await b2cResponse.json();
                    if (!b2cResponse.ok || !b2cResult.success) {
                      await supabase
                        .from('withdrawals')
                        .update({
                          status: 'pending_retry',
                          b2c_attempt_count: 1,
                          last_b2c_attempt_at: new Date().toISOString(),
                          b2c_error_details: { error: b2cResult.error || 'B2C initiation failed' }
                        })
                        .eq('id', newWithdrawal.id);
                    } else {
                      console.log(`✅ B2C initiated: ${b2cResult.conversation_id}`);
                    }
                  } catch (b2cError: any) {
                    console.error(`⚠️ B2C request error:`, b2cError);
                    await supabase
                      .from('withdrawals')
                      .update({
                        status: 'pending_retry',
                        b2c_attempt_count: 1,
                        last_b2c_attempt_at: new Date().toISOString(),
                        b2c_error_details: { error: b2cError.message }
                      })
                      .eq('id', newWithdrawal.id);
                  }
                }
              }
            }

            const totalExpected = totalMembers * chama.contribution_amount;
            await supabase
              .from('contribution_cycles')
              .update({
                payout_amount: payoutAmount,
                payout_type: payoutType,
                members_paid_count: paidCount,
                members_skipped_count: (wasSkipped ? 1 : 0) + unpaidMembers.length,
                total_collected_amount: collectedAmount,
                total_expected_amount: totalExpected
              })
              .eq('id', cycle.id);

            const beneficiaryPhone = actualBeneficiary.profiles?.phone;
            if (beneficiaryPhone) {
              const isFullPayout2 = paidCount === totalMembers;
              const message = wasSkipped
                ? `🎉 You're receiving the chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} today! (Redirected payout)`
                : isFullPayout2
                  ? `🎉 Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} has been processed. Full payout — all members contributed!`
                  : `Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} has been processed. Partial payout (${paidCount}/${totalMembers} members paid). ${totalMembers - paidCount} member(s) still owe you.`;
              
              await sendSMS(beneficiaryPhone, message);
            }
          }
        }

        // ========== PHASE I: ACCRUE DEBTS FOR NON-PAYERS ==========
        const commissionRate = chama.commission_rate || 0.05;
        await accrueDebtsForCycle(
          supabase,
          chama.id,
          cycle.id,
          cycle.cycle_number,
          scheduledBeneficiary.id,
          unpaidMembers,
          chama.contribution_amount,
          commissionRate
        );

        // ========== TRACK MISSED PAYMENTS + AUTO-REMOVE ==========
        for (const unpaid of unpaidMembers) {
          const member = unpaid.chama_members;
          const newMissedCount = (member.missed_payments_count || 0) + 1;
          const totalOutstanding = newMissedCount * chama.contribution_amount;

          await supabase
            .from('chama_members')
            .update({
              missed_payments_count: newMissedCount,
              requires_admin_verification: newMissedCount >= 1,
              balance_deficit: totalOutstanding
            })
            .eq('id', member.id);

          if (newMissedCount >= 3) {
            console.log(`🚫 AUTO-REMOVING member ${member.member_code} - 3 consecutive missed payments`);

            await supabase.from('chama_member_removals').insert({
              chama_id: chama.id,
              member_id: member.id,
              user_id: member.user_id,
              removal_reason: `Auto-removed: ${newMissedCount} consecutive missed payments. Outstanding balance: KES ${totalOutstanding.toLocaleString()}`,
              chama_name: chama.name,
              member_name: member.profiles?.full_name,
              member_phone: member.profiles?.phone,
              was_manager: member.is_manager || false,
              removed_at: new Date().toISOString()
            });

            await supabase.from('chama_members').update({
              status: 'removed',
              removal_reason: `Auto-removed: ${newMissedCount} consecutive missed payments. Outstanding: KES ${totalOutstanding.toLocaleString()}`,
              removed_at: new Date().toISOString()
            }).eq('id', member.id);

            // Audit log for auto-removal
            await supabase.from('audit_logs').insert({
              action: 'MEMBER_AUTO_REMOVED',
              table_name: 'chama_members',
              record_id: member.id,
              new_values: { missed_payments: newMissedCount, outstanding: totalOutstanding, chama: chama.name }
            });

            const memberPhone = member.profiles?.phone;
            if (memberPhone) {
              await sendSMS(memberPhone,
                `❌ You have been removed from "${chama.name}" after ${newMissedCount} consecutive missed payments. Outstanding balance: KES ${totalOutstanding.toLocaleString()}.`
              );
            }

            if (member.user_id) {
              await supabase.from('notifications').insert({
                user_id: member.user_id,
                title: 'Removed from Chama',
                message: `You were removed from "${chama.name}" due to ${newMissedCount} consecutive missed payments. Outstanding: KES ${totalOutstanding.toLocaleString()}.`,
                type: 'warning',
                category: 'chama',
                related_entity_id: chama.id,
                related_entity_type: 'chama'
              });
            }

            // Manager auto-reassignment
            if (member.is_manager) {
              console.log(`👑 Removed member was manager. Finding replacement for chama ${chama.name}`);
              
              // First try: member with zero missed payments
              let { data: bestCandidate } = await supabase
                .from('chama_members')
                .select('id, user_id, member_code, missed_payments_count, profiles!chama_members_user_id_fkey(full_name, phone)')
                .eq('chama_id', chama.id)
                .eq('status', 'active')
                .eq('approval_status', 'approved')
                .eq('missed_payments_count', 0)
                .order('order_index', { ascending: true })
                .limit(1)
                .maybeSingle();

              // Fallback: no perfect candidate — pick the most favorable (lowest missed payments)
              if (!bestCandidate) {
                console.log(`⚠️ No zero-miss candidate. Selecting most favorable active member for chama ${chama.name}`);
                const { data: fallbackCandidate } = await supabase
                  .from('chama_members')
                  .select('id, user_id, member_code, missed_payments_count, profiles!chama_members_user_id_fkey(full_name, phone)')
                  .eq('chama_id', chama.id)
                  .eq('status', 'active')
                  .eq('approval_status', 'approved')
                  .order('missed_payments_count', { ascending: true })
                  .order('order_index', { ascending: true })
                  .limit(1)
                  .maybeSingle();

                bestCandidate = fallbackCandidate;
              }

              if (bestCandidate) {
                await supabase.from('chama_members')
                  .update({ is_manager: true })
                  .eq('id', bestCandidate.id);

                console.log(`👑 New manager assigned: ${bestCandidate.profiles?.full_name} (${bestCandidate.member_code}) [missed: ${bestCandidate.missed_payments_count || 0}]`);

                // Audit log
                await supabase.from('audit_logs').insert({
                  action: 'MANAGER_AUTO_REASSIGNED',
                  table_name: 'chama_members',
                  record_id: bestCandidate.id,
                  new_values: {
                    chama_id: chama.id,
                    chama_name: chama.name,
                    new_manager: bestCandidate.member_code,
                    missed_payments: bestCandidate.missed_payments_count || 0,
                    reason: 'Previous manager auto-removed. Best available candidate selected.'
                  }
                });

                if (bestCandidate.profiles?.phone) {
                  await sendSMS(bestCandidate.profiles.phone,
                    `👑 You are now the manager of "${chama.name}". The previous manager was removed due to missed payments. Log in to manage your group.`
                  );
                }

                if (bestCandidate.user_id) {
                  await supabase.from('notifications').insert({
                    user_id: bestCandidate.user_id,
                    title: 'You Are Now Manager',
                    message: `You have been assigned as manager of "${chama.name}" after the previous manager was removed.`,
                    type: 'info',
                    category: 'chama',
                    related_entity_id: chama.id,
                    related_entity_type: 'chama'
                  });
                }

                const { data: remainingMembers } = await supabase
                  .from('chama_members')
                  .select('user_id, profiles!chama_members_user_id_fkey(phone)')
                  .eq('chama_id', chama.id)
                  .eq('status', 'active')
                  .eq('approval_status', 'approved')
                  .neq('id', bestCandidate.id);

                if (remainingMembers) {
                  for (const rm of remainingMembers) {
                    if (rm.profiles?.phone) {
                      await sendSMS(rm.profiles.phone,
                        `ℹ️ "${chama.name}" has a new manager: ${bestCandidate.profiles?.full_name}. The previous manager was removed due to missed payments.`
                      );
                    }
                  }
                }
              } else {
                // This should be virtually impossible (would mean zero active members)
                console.error(`🚨 CRITICAL: No active members remain in chama ${chama.name} to assign as manager`);
                
                // Notify admins of critical state
                const { data: adminUsers } = await supabase
                  .from('user_roles')
                  .select('user_id')
                  .eq('role', 'admin');

                for (const admin of (adminUsers || [])) {
                  await supabase.from('notifications').insert({
                    user_id: admin.user_id,
                    title: 'Critical: Chama Has No Members',
                    message: `Chama "${chama.name}" has no active members remaining after auto-removal. Manual intervention required.`,
                    type: 'warning',
                    category: 'admin',
                    related_entity_id: chama.id,
                    related_entity_type: 'chama'
                  });
                }
              }
            }

            // Resequence remaining members
            console.log(`🔄 Resequencing members for chama ${chama.name} after removal`);
            await supabase.rpc('resequence_member_order', { p_chama_id: chama.id });
            await supabase.rpc('calculate_expected_contributions', { p_chama_id: chama.id });

            continue;
          }

          const memberPhone = member.profiles?.phone;
          if (memberPhone && newMissedCount >= 1) {
            const warningMessage = newMissedCount === 1
              ? `⚠️ You missed a payment for "${chama.name}". Total outstanding: KES ${totalOutstanding.toLocaleString()}. Pay immediately to avoid penalties.`
              : `🚨 WARNING: ${newMissedCount} consecutive missed payments for "${chama.name}". Outstanding: KES ${totalOutstanding.toLocaleString()}. You will be REMOVED after 1 more!`;
            await sendSMS(memberPhone, warningMessage);
          }

          if (newMissedCount === 2) {
            const { data: manager } = await supabase
              .from('chama_members')
              .select('profiles!chama_members_user_id_fkey(phone)')
              .eq('chama_id', chama.id)
              .eq('is_manager', true)
              .eq('status', 'active')
              .maybeSingle();

            if (manager?.profiles?.phone) {
              await sendSMS(manager.profiles.phone,
                `⚠️ URGENT: Member ${member.profiles?.full_name} (${member.member_code}) has missed ${newMissedCount} payments in "${chama.name}". Outstanding: KES ${totalOutstanding.toLocaleString()}. Auto-removal after 1 more miss.`
              );
            }
          }
        }

        // ========== AUTO-CREATE NEXT CYCLE ==========
        try {
          const createCycleResponse = await fetch(`${supabaseUrl}/functions/v1/cycle-auto-create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ chamaId: chama.id, lastCycleId: cycle.id })
          });

          const createCycleResult = await createCycleResponse.json();
          if (createCycleResponse.ok && createCycleResult.success) {
            console.log(`✅ Next cycle created for ${chama.name}`);
          } else {
            console.error(`⚠️ Failed to create next cycle:`, createCycleResult);
          }
        } catch (createError: any) {
          console.error(`⚠️ Error creating next cycle:`, createError);
        }

        // ========== CHECK CYCLE COMPLETION ==========
        const { data: allProcessedCycles } = await supabase
          .from('contribution_cycles')
          .select('id')
          .eq('chama_id', chama.id)
          .eq('payout_processed', true);

        const { data: allMembers } = await supabase
          .from('chama_members')
          .select('id')
          .eq('chama_id', chama.id)
          .eq('approval_status', 'approved')
          .eq('status', 'active');

        const currentRound = chama.current_cycle_round || 1;
        const memberCount = allMembers?.length || 0;
        const latestProcessedCycleNum = cycle.cycle_number;
        const isRotationComplete = memberCount > 0 && latestProcessedCycleNum > 0 && 
          latestProcessedCycleNum % memberCount === 0 &&
          latestProcessedCycleNum === currentRound * memberCount;

        if (allProcessedCycles && allMembers && isRotationComplete) {
          console.log(`🎉 Full cycle round ${currentRound} complete for chama ${chama.name}`);

          await supabase.from('chama_cycle_history').insert({
            chama_id: chama.id,
            cycle_round: currentRound,
            started_at: chama.created_at,
            completed_at: new Date().toISOString(),
            total_members: allMembers.length,
            total_payouts_made: allProcessedCycles.length
          });

          await supabase.from('chama').update({
            last_cycle_completed_at: new Date().toISOString(),
            accepting_rejoin_requests: true,
            status: 'cycle_complete'
          }).eq('id', chama.id);

          try {
            await fetch(`${supabaseUrl}/functions/v1/chama-cycle-complete`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ chamaId: chama.id })
            });
          } catch (invokeError) {
            console.error('Error invoking cycle-complete:', invokeError);
          }
        }

        payoutsProcessed++;
      }
    }

    console.log(`[CRON] Daily payout completed. Processed: ${payoutsProcessed}, Skipped: ${skipsProcessed}, Errors: ${errors}`);

    return new Response(JSON.stringify({
      success: true,
      payoutsProcessed,
      skipsProcessed,
      errors,
      processedChamas: chamas?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in daily-payout-cron:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
