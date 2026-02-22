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

  const isEligible = unpaidCycles.length === 0 && totalCycles > 0;

  return {
    isEligible,
    required: totalCycles * contributionAmount,
    contributed: totalPaidCycles * contributionAmount,
    shortfall: totalUnpaid,
    unpaidCycles: unpaidCycles.length
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

  await supabase
    .from('chama_members')
    .update({
      was_skipped: true,
      skipped_at: new Date().toISOString(),
      skip_reason: reason,
      contribution_status: 'skipped'
    })
    .eq('id', memberId);

  return !error;
}

/**
 * Phase I – Consequence Management:
 * Create debt and deficit records for each member who did NOT pay this cycle.
 * Spec rules:
 *  - principal_debt = expected_contribution
 *  - penalty_debt   = expected_contribution × late_penalty_rate (10%)
 *  - Self-inflicted deficit: if the ONLY non-payer IS the recipient, no deficit record is created.
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

    // Insert debt record
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

    // Skip deficit record for self-inflicted scenario
    if (isSelfInflicted) {
      console.log(`ℹ️ Self-inflicted deficit detected — no deficit record created for member ${memberId}`);
      continue;
    }

    // Net owed to recipient = principal × (1 - commission_rate)
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
    }

    // Notify member of accrued debt
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
      .select('id, name, contribution_amount, commission_rate, contribution_frequency, current_cycle_round, created_at')
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
      // If there are no pending cycles, check if cycles should be created
      const { data: latestCycle } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number, end_date, payout_processed')
        .eq('chama_id', chama.id)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestCycle && latestCycle.payout_processed) {
        // Check if the latest cycle's end_date is in the past and no new cycle exists
        const latestEndDate = new Date(latestCycle.end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (latestEndDate < today) {
          // GAP DETECTED: Create missing cycles up to today (max 50 to avoid timeout)
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
            const MAX_CATCHUP_CYCLES = 50;

            while (cyclesCreated < MAX_CATCHUP_CYCLES) {
              // Calculate next cycle dates
              const nextStart = new Date(lastEndDate);
              nextStart.setDate(nextStart.getDate() + 1);
              nextStart.setHours(0, 0, 0, 0);
              
              if (nextStart > today) break; // Don't create future cycles beyond today

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
                  nextEnd.setMonth(nextEnd.getMonth() + 1);
                  nextEnd.setDate(0);
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

              // Historical gap cycles are pre-marked as processed (no payout)
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

              // Create unpaid payment records for all members
              const paymentRecords = activeMembers.map(m => ({
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

              console.log(`[GAP RECOVERY] Created cycle ${nextCycleNum} for ${chama.name} (${nextStart.toISOString().split('T')[0]})`);
              
              lastEndDate = nextEnd;
              lastCycleNum = nextCycleNum;
              cyclesCreated++;
            }

            if (cyclesCreated > 0) {
              console.log(`[GAP RECOVERY] Created ${cyclesCreated} missing cycles for ${chama.name}`);
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
          console.log(`⚠️ Member ${scheduledBeneficiary.member_code} NOT ELIGIBLE for payout.`);

          wasSkipped = true;

          await recordPayoutSkip(
            supabase,
            chama.id,
            scheduledBeneficiary.id,
            cycle.id,
            scheduledBeneficiary.order_index,
            null,
            eligibility.shortfall,
            eligibility.contributed,
            `Incomplete cycle payments: ${eligibility.unpaidCycles} unpaid cycle(s), shortfall KES ${eligibility.shortfall}`
          );

          const skipPhone = scheduledBeneficiary.profiles?.phone;
          if (skipPhone) {
            await sendSMS(skipPhone, `⚠️ Your chama "${chama.name}" payout was SKIPPED today. Reason: ${eligibility.unpaidCycles} unpaid cycle(s). Outstanding: KES ${eligibility.shortfall}. Please clear your missed payments.`);
          }

          skipsProcessed++;

          const nextEligible = await findNextEligibleMember(
            supabase,
            chama.id,
            chama.contribution_amount,
            scheduledBeneficiary.order_index + 1
          );

          if (!nextEligible) {
            await supabase
              .from('contribution_cycles')
              .update({
                payout_processed: true,
                payout_processed_at: new Date().toISOString(),
                payout_amount: 0,
                payout_type: 'none',
                members_skipped_count: 1
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
        // STRICT OVERPAYMENT RULE: each member's obligation is independent
        const unpaidMembers = payments?.filter((p: any) => !p.fully_paid) || [];

        if (!skipPayout) {
          // STRICT: only sum from members who fully paid their own obligation
          const collectedFromOnTime = paidOnTimeMembers.reduce((sum: number, p: any) => sum + (p.amount_paid || 0), 0);
          const collectedFromLate = paidLateMembers.reduce((sum: number, p: any) => sum + (p.amount_paid || 0), 0);
          const collectedAmount = collectedFromOnTime + collectedFromLate;

          // Late penalties already deducted at payment time; on-time 5% deducted at payout
          const onTimeCommission = collectedFromOnTime * 0.05;
          const latePenaltiesCollected = paidLateMembers.reduce((sum: number, p: any) => {
            return sum + ((p.amount_paid || 0) * (0.10 / 0.90));
          }, 0);
          const totalCommission = onTimeCommission;
          const payoutAmount = collectedAmount - onTimeCommission;

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
                  requested_by: actualBeneficiary.user_id,
                  amount: collectedAmount,
                  commission_amount: totalCommission,
                  net_amount: payoutAmount,
                  status: withdrawalStatus,
                  payment_method_id: paymentMethod?.id,
                  payment_method_type: paymentMethod?.method_type,
                  notes: `${wasSkipped ? `Redirected payout (${scheduledBeneficiary.member_code} skipped). ` : ''}${payoutType} (${paidCount}/${totalMembers} paid) | Late penalties collected: KES ${latePenaltiesCollected.toFixed(2)}`,
                  requested_at: new Date().toISOString(),
                  b2c_attempt_count: 0,
                  ...(withdrawalStatus === 'approved' ? { reviewed_at: new Date().toISOString() } : {})
                })
                .select('id')
                .single();

              if (withdrawalError) {
                console.error('Error creating withdrawal:', withdrawalError);
                errors++;
              } else {
                await supabase.rpc('record_company_earning', {
                  p_source: 'chama_commission',
                  p_amount: totalCommission,
                  p_group_id: chama.id,
                  p_description: `Payout commission - ${chama.name} cycle #${cycle.cycle_number}. On-time: KES ${onTimeCommission.toFixed(2)}`
                });

                if (canAutoApprove && newWithdrawal && paymentMethod?.phone_number) {
                  const beneficiaryPhone = actualBeneficiary.profiles?.phone || paymentMethod.phone_number;
                  if (beneficiaryPhone) {
                    await sendSMS(beneficiaryPhone, 
                      `💰 Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} is being processed. You should receive it within 2 minutes.`
                    );
                  }

                  try {
                    const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
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
                payout_processed: true,
                payout_processed_at: new Date().toISOString(),
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
        // This runs REGARDLESS of payout outcome
        const commissionRate = chama.commission_rate || 0.05;
        await accrueDebtsForCycle(
          supabase,
          chama.id,
          cycle.id,
          cycle.cycle_number,
          scheduledBeneficiary.id,  // original beneficiary, not redirected
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

            // ========== MANAGER AUTO-REASSIGNMENT ==========
            if (member.is_manager) {
              console.log(`👑 Removed member was manager. Finding replacement for chama ${chama.name}`);
              
              const { data: bestCandidate } = await supabase
                .from('chama_members')
                .select('id, user_id, member_code, profiles!chama_members_user_id_fkey(full_name, phone)')
                .eq('chama_id', chama.id)
                .eq('status', 'active')
                .eq('approval_status', 'approved')
                .eq('missed_payments_count', 0)
                .order('order_index', { ascending: true })
                .limit(1)
                .maybeSingle();

              if (bestCandidate) {
                await supabase.from('chama_members')
                  .update({ is_manager: true })
                  .eq('id', bestCandidate.id);

                console.log(`👑 New manager assigned: ${bestCandidate.profiles?.full_name} (${bestCandidate.member_code})`);

                // Notify new manager
                if (bestCandidate.profiles?.phone) {
                  await sendSMS(bestCandidate.profiles.phone,
                    `👑 You are now the manager of "${chama.name}". The previous manager was removed due to missed payments. Log in to manage your group.`
                  );
                }

                // Notify all remaining active members about the manager change
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
                console.warn(`⚠️ No eligible replacement manager found for chama ${chama.name}`);
              }
            }

            // ========== RESEQUENCE REMAINING MEMBERS ==========
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

        // ========== AUTO-CREATE NEXT CYCLE (always) ==========
        // Always create the next cycle first, THEN check for cycle completion
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

        // ========== CHECK CYCLE COMPLETION (after creating next cycle) ==========
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
        // A rotation is complete when the latest cycle number is a multiple of member count
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
            await supabase.functions.invoke('chama-cycle-complete', { body: { chamaId: chama.id } });
          } catch (invokeError) {
            console.error('Error invoking cycle-complete:', invokeError);
          }
          // Don't break - allow remaining cycles to be processed
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
