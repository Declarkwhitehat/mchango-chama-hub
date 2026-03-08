import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ONTIME_RATE = 0.05;  // 5% commission on-time
const LATE_RATE = 0.10;    // 10% penalty on late payments

interface AllocationLine {
  type: string;
  debt_id?: string;
  cycle_number?: number;
  amount: number;
  destination: string;
  description: string;
}

interface SettleResult {
  allocations: AllocationLine[];
  total_gross: number;
  total_to_company: number;
  total_to_recipients: number;
  total_to_cycle_pot: number;
  carry_forward: number;
  periods_cleared: number;
}

/**
 * Preview-only allocation math — NO DB writes.
 * Returns exactly how a gross_amount will be split.
 */
async function previewAllocation(
  supabase: any,
  memberId: string,
  chamaId: string,
  grossAmount: number,
  contributionAmount: number
): Promise<SettleResult> {
  // Load outstanding debts (oldest first)
  const { data: debts } = await supabase
    .from('chama_member_debts')
    .select(`
      id, principal_remaining, penalty_remaining, status,
      chama_cycle_deficits!debt_id(
        recipient_member_id,
        chama_members!recipient_member_id(
          profiles!chama_members_user_id_fkey(full_name)
        )
      ),
      contribution_cycles!cycle_id(cycle_number)
    `)
    .eq('member_id', memberId)
    .eq('chama_id', chamaId)
    .in('status', ['outstanding', 'partial'])
    .order('created_at', { ascending: true });

  // Load current active cycle
  const now = new Date().toISOString().split('T')[0];
  const { data: cycle } = await supabase
    .from('contribution_cycles')
    .select('*, member_cycle_payments!inner(amount_due, amount_paid, amount_remaining)')
    .eq('chama_id', chamaId)
    .lte('start_date', now)
    .gte('end_date', now)
    .eq('payout_processed', false)
    .eq('member_cycle_payments.member_id', memberId)
    .maybeSingle();

  const allocations: AllocationLine[] = [];
  let remaining = grossAmount;
  let toCompany = 0;
  let toRecipients = 0;
  let toCyclePot = 0;
  let carryForward = 0;
  let periodsCleared = 0;

  // Phase 1: Settle debts FIFO (penalty first, then principal)
  for (const debt of debts || []) {
    if (remaining <= 0) break;

    const cycleNum = debt.contribution_cycles?.cycle_number;
    const recipientName = debt.chama_cycle_deficits?.[0]?.chama_members?.profiles?.full_name || 'recipient';

    // a. Pay penalty first
    if (debt.penalty_remaining > 0 && remaining > 0) {
      const penaltyPay = Math.min(debt.penalty_remaining, remaining);
      remaining -= penaltyPay;
      toCompany += penaltyPay;
      allocations.push({
        type: 'penalty_clearance',
        debt_id: debt.id,
        cycle_number: cycleNum,
        amount: penaltyPay,
        destination: 'Platform fee',
        description: `10% penalty from Cycle #${cycleNum}`
      });
    }

    // b. Pay principal
    if (debt.principal_remaining > 0 && remaining > 0) {
      const principalPay = Math.min(debt.principal_remaining, remaining);
      const commission = principalPay * ONTIME_RATE;
      const netToRecipient = principalPay - commission;
      remaining -= principalPay;
      toCompany += commission;
      toRecipients += netToRecipient;

      allocations.push({
        type: 'principal_commission',
        debt_id: debt.id,
        cycle_number: cycleNum,
        amount: commission,
        destination: 'Platform fee',
        description: `5% commission on KES ${principalPay.toFixed(2)} principal`
      });
      allocations.push({
        type: 'principal_clearance',
        debt_id: debt.id,
        cycle_number: cycleNum,
        amount: netToRecipient,
        destination: `${recipientName} (clearing deficit)`,
        description: `Net proceeds from Cycle #${cycleNum} principal`
      });

      const willClearPrincipal = principalPay >= debt.principal_remaining;
      const willClearPenalty = debt.penalty_remaining <= 0 || allocations.some(a => a.debt_id === debt.id && a.type === 'penalty_clearance' && a.amount >= debt.penalty_remaining);
      if (willClearPrincipal && willClearPenalty) periodsCleared++;
    }
  }

  // Phase 2: Current cycle contribution
  if (remaining > 0 && cycle) {
    const amountDue = cycle.member_cycle_payments?.[0]?.amount_remaining || contributionAmount;
    const toApply = Math.min(remaining, amountDue);
    const commission = toApply * ONTIME_RATE;
    const net = toApply - commission;
    remaining -= toApply;
    toCompany += commission;
    toCyclePot += net;

    allocations.push({
      type: 'current_cycle_commission',
      cycle_number: cycle.cycle_number,
      amount: commission,
      destination: 'Platform fee',
      description: `5% commission on current cycle contribution`
    });
    allocations.push({
      type: 'current_cycle',
      cycle_number: cycle.cycle_number,
      amount: net,
      destination: 'Cycle collection pot',
      description: `Net contribution to Cycle #${cycle.cycle_number}`
    });
  }

  // Phase 3: Carry-forward overage
  if (remaining > 0) {
    const commission = remaining * ONTIME_RATE;
    const net = remaining - commission;
    toCompany += commission;
    carryForward += net;

    allocations.push({
      type: 'carry_forward_commission',
      amount: commission,
      destination: 'Platform fee',
      description: `5% commission on overpayment`
    });
    allocations.push({
      type: 'carry_forward',
      amount: net,
      destination: 'Your credit balance',
      description: `Credited to your next cycle`
    });
  }

  return {
    allocations,
    total_gross: grossAmount,
    total_to_company: toCompany,
    total_to_recipients: toRecipients,
    total_to_cycle_pot: toCyclePot,
    carry_forward: carryForward,
    periods_cleared: periodsCleared
  };
}

/**
 * FIFO Debt Settlement — Phase II of the spec.
 * Penalty first, then principal (routing net to deficit recipients), then current cycle, then carry-forward.
 */
async function settleDebts(
  supabase: any,
  memberId: string,
  chamaId: string,
  grossPaymentAmount: number,
  contributionAmount: number,
  contributionId?: string
): Promise<SettleResult> {
  const allocations: AllocationLine[] = [];
  let remaining = grossPaymentAmount;
  let toCompany = 0;
  let toRecipients = 0;
  let toCyclePot = 0;
  let carryForward = 0;
  let periodsCleared = 0;

  // ── STEP 1: Load outstanding debts (oldest first) ──
  const { data: debts } = await supabase
    .from('chama_member_debts')
    .select(`
      id, principal_remaining, penalty_remaining, status, payment_allocations,
      chama_cycle_deficits!debt_id(
        id, recipient_member_id, status
      ),
      contribution_cycles!cycle_id(cycle_number)
    `)
    .eq('member_id', memberId)
    .eq('chama_id', chamaId)
    .in('status', ['outstanding', 'partial'])
    .order('created_at', { ascending: true });

  // ── STEP 2: For each debt (FIFO): pay penalty → pay principal ──
  for (const debt of debts || []) {
    if (remaining <= 0) break;

    const cycleNum = debt.contribution_cycles?.cycle_number;
    const deficitRecord = debt.chama_cycle_deficits?.[0];
    let debtUpdates: any = {};
    const debtAllocEntry: any = {
      timestamp: new Date().toISOString(),
      payment_gross: 0,
      penalty_cleared: 0,
      principal_cleared: 0
    };

    // 2a. Pay penalty_remaining first → company_revenue_account
    if (debt.penalty_remaining > 0 && remaining > 0) {
      const penaltyPay = Math.min(debt.penalty_remaining, remaining);
      remaining -= penaltyPay;
      toCompany += penaltyPay;
      debtAllocEntry.penalty_cleared = penaltyPay;
      debtAllocEntry.payment_gross += penaltyPay;
      debtUpdates.penalty_remaining = debt.penalty_remaining - penaltyPay;

      // Record penalty earning
      await supabase.from('company_earnings').insert({
        source: 'chama_late_penalty',
        amount: penaltyPay,
        group_id: chamaId,
        description: `Late penalty cleared for cycle #${cycleNum}`
      });

      allocations.push({
        type: 'penalty_clearance',
        debt_id: debt.id,
        cycle_number: cycleNum,
        amount: penaltyPay,
        destination: 'Platform fee',
        description: `10% penalty from Cycle #${cycleNum}`
      });
    }

    // 2b. Pay principal_remaining → commission to company, net to deficit recipient
    if (debt.principal_remaining > 0 && remaining > 0) {
      const principalPay = Math.min(debt.principal_remaining, remaining);
      const commission = principalPay * ONTIME_RATE;
      const netToRecipient = principalPay - commission;
      remaining -= principalPay;
      toCompany += commission;
      toRecipients += netToRecipient;
      debtAllocEntry.principal_cleared = principalPay;
      debtAllocEntry.payment_gross += principalPay;
      debtUpdates.principal_remaining = debt.principal_remaining - principalPay;

      // Record commission earning
      await supabase.from('company_earnings').insert({
        source: 'chama_commission',
        amount: commission,
        group_id: chamaId,
        description: `Commission on principal repayment for cycle #${cycleNum}`
      });

      allocations.push({
        type: 'principal_commission',
        debt_id: debt.id,
        cycle_number: cycleNum,
        amount: commission,
        destination: 'Platform fee',
        description: `5% commission on KES ${principalPay.toFixed(2)} principal`
      });
      allocations.push({
        type: 'principal_clearance',
        debt_id: debt.id,
        cycle_number: cycleNum,
        amount: netToRecipient,
        destination: 'Deficit recipient (transferred)',
        description: `Net from Cycle #${cycleNum} principal to original recipient`
      });

      // Mark deficit as PAID and DISBURSE funds to shortchanged recipient
      const newPenaltyRemaining = debtUpdates.penalty_remaining ?? debt.penalty_remaining;
      const newPrincipalRemaining = debtUpdates.principal_remaining;
      const isDebtCleared = newPrincipalRemaining <= 0 && newPenaltyRemaining <= 0;

      if (deficitRecord && principalPay >= debt.principal_remaining) {
        await supabase.from('chama_cycle_deficits').update({
          status: 'paid',
          paid_at: new Date().toISOString()
        }).eq('id', deficitRecord.id);

        console.log(`✅ Deficit ${deficitRecord.id} marked PAID — KES ${netToRecipient.toFixed(2)} to be disbursed to recipient`);

        // ===== DEFICIT DISBURSEMENT: Actually send money to shortchanged recipient =====
        if (netToRecipient > 0 && deficitRecord.recipient_member_id) {
          try {
            // Get recipient's user_id and payment method
            const { data: recipientMember } = await supabase
              .from('chama_members')
              .select('user_id, member_code')
              .eq('id', deficitRecord.recipient_member_id)
              .single();

            if (recipientMember?.user_id) {
              const { data: recipientPaymentMethod } = await supabase
                .from('payment_methods')
                .select('id, method_type, phone_number')
                .eq('user_id', recipientMember.user_id)
                .eq('is_default', true)
                .maybeSingle();

              if (recipientPaymentMethod) {
                const canAutoApprove = recipientPaymentMethod.method_type === 'mpesa';

                // Create withdrawal for deficit settlement
                const { data: deficitWithdrawal, error: defWithdrawErr } = await supabase
                  .from('withdrawals')
                  .insert({
                    chama_id: chamaId,
                    cycle_id: deficitRecord.cycle_id, // Enable duplicate guard via unique index
                    requested_by: recipientMember.user_id,
                    amount: principalPay,
                    commission_amount: commission,
                    net_amount: netToRecipient,
                    status: canAutoApprove ? 'approved' : 'pending',
                    payment_method_id: recipientPaymentMethod.id,
                    payment_method_type: recipientPaymentMethod.method_type,
                    notes: `Deficit settlement: Cycle #${cycleNum} late payment received. Net KES ${netToRecipient.toFixed(2)} to ${recipientMember.member_code}`,
                    requested_at: new Date().toISOString(),
                    b2c_attempt_count: 0,
                    ...(canAutoApprove ? { reviewed_at: new Date().toISOString() } : {})
                  })
                  .select('id')
                  .single();

                if (deficitWithdrawal && !defWithdrawErr) {
                  // Record in financial_ledger
                  await supabase.from('financial_ledger').insert({
                    transaction_type: 'deficit_settlement',
                    source_type: 'chama',
                    source_id: chamaId,
                    gross_amount: principalPay,
                    commission_amount: commission,
                    net_amount: netToRecipient,
                    commission_rate: ONTIME_RATE,
                    reference_id: deficitWithdrawal.id,
                    description: `Deficit settlement: Cycle #${cycleNum} → ${recipientMember.member_code}. Debt ${debt.id} cleared.`
                  });

                  // Audit log
                  await supabase.from('audit_logs').insert({
                    action: 'DEFICIT_SETTLED',
                    table_name: 'withdrawals',
                    record_id: deficitWithdrawal.id,
                    new_values: {
                      deficit_id: deficitRecord.id,
                      debt_id: debt.id,
                      recipient: recipientMember.member_code,
                      net_amount: netToRecipient,
                      cycle_number: cycleNum
                    }
                  });

                  // Trigger B2C payout if auto-approved
                  if (canAutoApprove && recipientPaymentMethod.phone_number) {
                    try {
                      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                      await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          withdrawal_id: deficitWithdrawal.id,
                          phone_number: recipientPaymentMethod.phone_number,
                          amount: netToRecipient
                        })
                      });
                      console.log(`✅ B2C initiated for deficit settlement: KES ${netToRecipient.toFixed(2)} to ${recipientMember.member_code}`);
                    } catch (b2cErr: any) {
                      console.error(`⚠️ B2C error for deficit settlement:`, b2cErr);
                      await supabase.from('withdrawals').update({
                        status: 'pending_retry',
                        b2c_attempt_count: 1,
                        last_b2c_attempt_at: new Date().toISOString(),
                        b2c_error_details: { error: b2cErr.message }
                      }).eq('id', deficitWithdrawal.id);
                    }
                  }

                  // Notify recipient
                  await supabase.from('notifications').insert({
                    user_id: recipientMember.user_id,
                    title: 'Deficit Payment Received',
                    message: `A late payment has been received! KES ${netToRecipient.toFixed(2)} from Cycle #${cycleNum} is being sent to you.`,
                    type: 'info',
                    category: 'chama',
                    related_entity_id: chamaId,
                    related_entity_type: 'chama'
                  });
                } else if (defWithdrawErr) {
                  console.error(`Error creating deficit withdrawal:`, defWithdrawErr);
                }
              } else {
                console.warn(`No payment method for deficit recipient ${recipientMember.member_code}`);
              }
            }
          } catch (disbursementErr: any) {
            console.error(`Error in deficit disbursement:`, disbursementErr);
          }
        }
      }

      if (isDebtCleared) periodsCleared++;
    }

    // Update debt record
    const newStatus = (debtUpdates.principal_remaining <= 0 && (debtUpdates.penalty_remaining ?? debt.penalty_remaining) <= 0)
      ? 'cleared'
      : 'partial';

    const existingAllocs = Array.isArray(debt.payment_allocations) ? debt.payment_allocations : [];
    await supabase.from('chama_member_debts').update({
      ...debtUpdates,
      status: newStatus,
      ...(newStatus === 'cleared' ? { cleared_at: new Date().toISOString() } : {}),
      payment_allocations: JSON.stringify([...existingAllocs, debtAllocEntry])
    }).eq('id', debt.id);
  }

  // ── STEP 3: Apply remaining to current cycle ──
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const { data: cycle } = await supabase
    .from('contribution_cycles')
    .select('*, member_cycle_payments!inner(id, amount_due, amount_paid, amount_remaining, fully_paid, payment_allocations)')
    .eq('chama_id', chamaId)
    .lte('start_date', today)
    .gte('end_date', today)
    .eq('payout_processed', false)
    .eq('member_cycle_payments.member_id', memberId)
    .maybeSingle();

  if (remaining > 0 && cycle) {
    const cyclePayment = cycle.member_cycle_payments?.[0];
    const amountRemaining = cyclePayment?.amount_remaining ?? (cycle.due_amount || contributionAmount);

    // Check if payment is past 10 PM deadline (late)
    const cycleEndDate = new Date(cycle.end_date);
    const lateDeadline = new Date(cycleEndDate);
    lateDeadline.setHours(22, 0, 0, 0);
    const isLate = now > lateDeadline;
    const cycleCommissionRate = isLate ? LATE_RATE : ONTIME_RATE;

    const toApply = Math.min(remaining, amountRemaining / (1 - cycleCommissionRate));
    const commission = toApply * cycleCommissionRate;
    const net = toApply - commission;
    remaining -= toApply;
    toCompany += commission;
    toCyclePot += net;

    const newAmountPaid = (cyclePayment?.amount_paid || 0) + net;
    const isFullyPaid = newAmountPaid >= (cyclePayment?.amount_due || contributionAmount);

    // Update or create cycle payment record
    if (cyclePayment) {
      const existingAllocations = cyclePayment.payment_allocations || [];
      await supabase.from('member_cycle_payments').update({
        amount_paid: newAmountPaid,
        amount_remaining: Math.max(0, (cyclePayment.amount_due || contributionAmount) - newAmountPaid),
        fully_paid: isFullyPaid,
        is_paid: isFullyPaid,
        is_late_payment: isLate,
        paid_at: isFullyPaid ? new Date().toISOString() : null,
        payment_allocations: JSON.stringify([...existingAllocations, {
          amount: net,
          gross_paid: toApply,
          commission: commission,
          commission_rate: cycleCommissionRate,
          timestamp: new Date().toISOString(),
          source: 'contribution',
          is_late: isLate
        }])
      }).eq('id', cyclePayment.id);
    } else {
      await supabase.from('member_cycle_payments').insert({
        member_id: memberId,
        cycle_id: cycle.id,
        amount_paid: net,
        amount_due: cycle.due_amount || contributionAmount,
        amount_remaining: Math.max(0, (cycle.due_amount || contributionAmount) - net),
        is_paid: isFullyPaid,
        fully_paid: isFullyPaid,
        is_late_payment: isLate,
        paid_at: isFullyPaid ? new Date().toISOString() : null,
        payment_allocations: JSON.stringify([{
          amount: net,
          gross_paid: toApply,
          commission: commission,
          commission_rate: cycleCommissionRate,
          timestamp: new Date().toISOString(),
          source: 'contribution',
          is_late: isLate
        }])
      });
    }

    if (isFullyPaid) periodsCleared++;

    allocations.push({
      type: 'current_cycle_commission',
      cycle_number: cycle.cycle_number,
      amount: commission,
      destination: 'Platform fee',
      description: `${isLate ? '10% late' : '5% on-time'} commission on current cycle`
    });
    allocations.push({
      type: 'current_cycle',
      cycle_number: cycle.cycle_number,
      amount: net,
      destination: 'Cycle collection pot',
      description: `Net contribution to Cycle #${cycle.cycle_number}`
    });

    // Record commission
    await supabase.from('company_earnings').insert({
      source: 'chama_commission',
      amount: commission,
      group_id: chamaId,
      description: `${isLate ? 'Late' : 'On-time'} contribution commission — Cycle #${cycle.cycle_number}`
    });
  } else if (remaining > 0) {
    // No active cycle found — try to create payment record if we just need to allocate
    // Allocate to member's pending cycles if any exist
    const { data: pendingCyclePayment } = await supabase
      .from('member_cycle_payments')
      .select('id, cycle_id, amount_due, amount_paid, amount_remaining, fully_paid, payment_allocations, contribution_cycles!inner(cycle_number)')
      .eq('member_id', memberId)
      .eq('fully_paid', false)
      .order('contribution_cycles(start_date)', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pendingCyclePayment && remaining > 0) {
      const commission = remaining * ONTIME_RATE;
      const net = remaining - commission;
      toCompany += commission;
      toCyclePot += net;

      const newPaid = (pendingCyclePayment.amount_paid || 0) + net;
      const isFullyPaid = newPaid >= (pendingCyclePayment.amount_due || contributionAmount);
      const existingAllocs = pendingCyclePayment.payment_allocations || [];

      await supabase.from('member_cycle_payments').update({
        amount_paid: newPaid,
        amount_remaining: Math.max(0, (pendingCyclePayment.amount_due || contributionAmount) - newPaid),
        fully_paid: isFullyPaid,
        is_paid: isFullyPaid,
        payment_allocations: JSON.stringify([...existingAllocs, {
          amount: net,
          gross_paid: remaining,
          commission,
          commission_rate: ONTIME_RATE,
          timestamp: new Date().toISOString(),
          source: 'contribution'
        }])
      }).eq('id', pendingCyclePayment.id);

      allocations.push({ type: 'pending_cycle', cycle_number: pendingCyclePayment.contribution_cycles?.cycle_number, amount: net, destination: 'Pending cycle', description: 'Allocated to pending cycle' });
      remaining = 0;
      if (isFullyPaid) periodsCleared++;
    }
  }

  // ── STEP 4: Any remaining → carry-forward ──
  if (remaining > 0) {
    const commission = remaining * ONTIME_RATE;
    const net = remaining - commission;
    toCompany += commission;
    carryForward += net;

    allocations.push({
      type: 'carry_forward_commission',
      amount: commission,
      destination: 'Platform fee',
      description: '5% commission on overpayment'
    });
    allocations.push({
      type: 'carry_forward',
      amount: net,
      destination: 'Your credit balance',
      description: 'Credited to your next cycle'
    });

    // Update carry-forward on member
    const { data: memberData } = await supabase
      .from('chama_members')
      .select('carry_forward_credit')
      .eq('id', memberId)
      .single();

    await supabase.from('chama_members').update({
      carry_forward_credit: (memberData?.carry_forward_credit || 0) + net,
      last_payment_date: new Date().toISOString()
    }).eq('id', memberId);
  } else {
    // Still update last payment date
    await supabase.from('chama_members').update({
      last_payment_date: new Date().toISOString()
    }).eq('id', memberId);
  }

  // ── STEP 5: Update chama financial tracking ──
  // Only count the gross that went to the cycle/debts, NOT the carry-forward portion
  // This ensures total_gross_collected reflects actual money that entered the chama pool
  const carryForwardGross = carryForward > 0 ? carryForward / (1 - ONTIME_RATE) : 0;
  const chamaGross = grossPaymentAmount - carryForwardGross;
  const chamaCommission = toCompany - (carryForward > 0 ? carryForwardGross * ONTIME_RATE : 0);

  if (chamaGross > 0 || toCyclePot > 0) {
    const { data: chamaData } = await supabase
      .from('chama')
      .select('total_gross_collected, total_commission_paid, available_balance')
      .eq('id', chamaId)
      .single();

    if (chamaData) {
      await supabase.from('chama').update({
        total_gross_collected: (chamaData.total_gross_collected || 0) + chamaGross,
        total_commission_paid: (chamaData.total_commission_paid || 0) + chamaCommission,
        available_balance: (chamaData.available_balance || 0) + toCyclePot,
      }).eq('id', chamaId);
    }

    await supabase.from('financial_ledger').insert({
      transaction_type: 'contribution',
      source_type: 'chama',
      source_id: chamaId,
      gross_amount: chamaGross,
      commission_amount: chamaCommission,
      net_amount: chamaGross - chamaCommission,
      commission_rate: chamaGross > 0 ? chamaCommission / chamaGross : ONTIME_RATE,
      reference_id: contributionId || null,
      description: `FIFO debt settlement. Debts cleared: ${periodsCleared}. Carry-forward: ${carryForward.toFixed(2)}. Penalty: ${allocations.filter(a => a.type === 'penalty_clearance').reduce((s, a) => s + a.amount, 0).toFixed(2)}`
    });
  }

  // ── STEP 6: Reset missed payment count for cleared debts ──
  if (periodsCleared > 0) {
    const { data: memberData } = await supabase
      .from('chama_members')
      .select('missed_payments_count')
      .eq('id', memberId)
      .single();

    if (memberData) {
      const newMissedCount = Math.max(0, (memberData.missed_payments_count || 0) - periodsCleared);
      await supabase.from('chama_members').update({
        missed_payments_count: newMissedCount,
        requires_admin_verification: newMissedCount >= 1
      }).eq('id', memberId);
    }
  }

  return {
    allocations,
    total_gross: grossPaymentAmount,
    total_to_company: toCompany,
    total_to_recipients: toRecipients,
    total_to_cycle_pot: toCyclePot,
    carry_forward: carryForward,
    periods_cleared: periodsCleared
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for settle-only action FIRST (called by payment callbacks with service role key)
    if (req.method === 'POST') {
      const clonedReq = req.clone();
      try {
        const peekBody = await clonedReq.json();
        if (peekBody.action === 'settle-only') {
          const { member_id, chama_id, amount, contribution_id } = peekBody;
          if (!member_id || !chama_id || !amount) {
            return new Response(JSON.stringify({ error: 'member_id, chama_id, amount required' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          );

          // Idempotency: check if this contribution was already settled
          if (contribution_id) {
            const { data: existingLedger } = await supabaseAdmin
              .from('financial_ledger')
              .select('id')
              .eq('reference_id', contribution_id)
              .eq('source_type', 'chama')
              .maybeSingle();

            if (existingLedger) {
              console.log('Settlement already processed for contribution:', contribution_id);
              return new Response(JSON.stringify({ 
                success: true, 
                already_settled: true,
                message: 'Settlement already processed'
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }

          const { data: chamaInfo } = await supabaseAdmin
            .from('chama')
            .select('contribution_amount')
            .eq('id', chama_id)
            .single();

          const settleResult = await settleDebts(
            supabaseAdmin,
            member_id,
            chama_id,
            amount,
            chamaInfo?.contribution_amount || amount,
            contribution_id
          );

          console.log('Settle-only complete:', {
            contribution_id,
            periodsCleared: settleResult.periods_cleared,
            toCompany: settleResult.total_to_company,
            toCyclePot: settleResult.total_to_cycle_pot,
          });

          return new Response(JSON.stringify({ 
            success: true,
            settlement: settleResult
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch (_) {
        // Not JSON or not settle-only, continue to normal auth flow
      }
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header', code: 'AUTH_REQUIRED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid or expired token', code: 'AUTH_INVALID' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const chamaId = url.searchParams.get('chama_id');

    // ── GET: List contributions ──
    if (req.method === 'GET') {
      if (!chamaId) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseClient
        .from('contributions')
        .select(`
          *,
          chama_members!contributions_member_id_fkey(member_code, profiles(full_name, email)),
          paid_by:chama_members!contributions_paid_by_member_id_fkey(member_code, profiles(full_name, email))
        `)
        .eq('chama_id', chamaId)
        .order('contribution_date', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── POST: Create contribution OR preview allocation ──
    if (req.method === 'POST') {
      const body = await req.json();

      // ── PREVIEW ALLOCATION (no DB writes) ──
      if (body.action === 'preview-allocation') {
        const { member_id, chama_id, gross_amount } = body;
        if (!member_id || !chama_id || !gross_amount) {
          return new Response(JSON.stringify({ error: 'member_id, chama_id, gross_amount required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: chamaInfo } = await supabaseClient
          .from('chama')
          .select('contribution_amount')
          .eq('id', chama_id)
          .single();

        const preview = await previewAllocation(
          supabaseClient,
          member_id,
          chama_id,
          gross_amount,
          chamaInfo?.contribution_amount || gross_amount
        );

        return new Response(JSON.stringify({ preview }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ── IDEMPOTENCY CHECK ──
      if (body.idempotency_key) {
        const { data: existing } = await supabaseClient
          .from('contributions')
          .select('id, amount, status')
          .eq('idempotency_key', body.idempotency_key)
          .maybeSingle();

        if (existing) {
          console.log('Idempotent request — returning existing contribution:', existing.id);
          return new Response(JSON.stringify({
            data: existing,
            idempotent: true,
            message: 'Payment already processed'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // ── KYC CHECK ──
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('kyc_status, phone, full_name')
        .eq('id', user.id)
        .single();

      if (!profile || profile.kyc_status !== 'approved') {
        return new Response(JSON.stringify({
          error: 'KYC verification required to make contributions',
          kyc_status: profile?.kyc_status || 'unknown'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── VALIDATE MEMBER ──
      const { data: member, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('*, chama(contribution_amount, slug, name)')
        .eq('id', body.member_id)
        .maybeSingle();

      if (memberError || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (body.paid_by_member_id && body.paid_by_member_id !== body.member_id) {
        const { data: payer } = await supabaseClient
          .from('chama_members')
          .select('id, chama_id')
          .eq('id', body.paid_by_member_id)
          .maybeSingle();

        if (!payer || payer.chama_id !== member.chama_id) {
          return new Response(JSON.stringify({ error: 'Payer must be a member of the same chama' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const contributionAmount = member.chama.contribution_amount;

      // ── FIRST PAYMENT ACTIVATION ──
      let isFirstPayment = false;
      let assignedOrderIndex: number | null = null;
      let assignedMemberCode: string | null = null;

      if (!member.first_payment_completed) {
        isFirstPayment = true;

        const { data: nextIndex } = await supabaseClient
          .rpc('get_next_order_index', { p_chama_id: member.chama_id });

        assignedOrderIndex = nextIndex || 1;

        const { data: memberCode } = await supabaseClient
          .rpc('generate_member_code', { p_chama_id: member.chama_id, p_order_index: assignedOrderIndex });

        assignedMemberCode = memberCode || member.member_code;

        await supabaseClient.from('chama_members').update({
          first_payment_completed: true,
          first_payment_at: new Date().toISOString(),
          order_index: assignedOrderIndex,
          member_code: assignedMemberCode,
          status: 'active',
        }).eq('id', member.id);

        if (profile?.phone) {
          try {
            await supabaseClient.functions.invoke('send-transactional-sms', {
              body: {
                phone: profile.phone,
                message: `Payment received! You are now Member #${assignedOrderIndex} in "${member.chama.name}". Your member code is ${assignedMemberCode}.`,
                eventType: 'first_payment_received'
              }
            });
          } catch (e) { /* non-critical */ }
        }
      }

      // ── CREATE CONTRIBUTION RECORD ──
      const { data: contributionData, error: contribError } = await supabaseClient
        .from('contributions')
        .insert(body)
        .select()
        .maybeSingle();

      if (contribError) throw contribError;

      // ── FIFO DEBT SETTLEMENT ──
      const settleResult = await settleDebts(
        supabaseClient,
        body.member_id,
        body.chama_id,
        body.amount,
        contributionAmount
      );

      console.log('Debt settlement complete:', {
        periodsCleared: settleResult.periods_cleared,
        toCompany: settleResult.total_to_company,
        toRecipients: settleResult.total_to_recipients,
        toCyclePot: settleResult.total_to_cycle_pot,
        carryForward: settleResult.carry_forward
      });

      // Send allocation SMS
      if (settleResult.periods_cleared > 0 && profile?.phone) {
        const debtLines = settleResult.allocations
          .filter(a => a.type === 'penalty_clearance' || a.type === 'principal_clearance')
          .length;
        try {
          await supabaseClient.functions.invoke('send-transactional-sms', {
            body: {
              phone: profile.phone,
              message: `Payment of KES ${body.amount} received. ✅ Cleared ${settleResult.periods_cleared} period(s). ${settleResult.carry_forward > 0 ? `Carry-forward: KES ${settleResult.carry_forward.toFixed(2)}` : 'All periods paid!'}`,
              eventType: 'payment_allocation'
            }
          });
        } catch (e) { /* non-critical */ }
      }

      // ── CHECK FOR IMMEDIATE PAYOUT TRIGGER ──
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const { data: currentCycle } = await supabaseClient
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', body.chama_id)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      if (currentCycle) {
        const { data: allPayments } = await supabaseClient
          .from('member_cycle_payments')
          .select('is_paid, is_late_payment, fully_paid')
          .eq('cycle_id', currentCycle.id);

        const totalMembers = allPayments?.length || 0;
        const paidOnTime = allPayments?.filter((p: any) => p.fully_paid && !p.is_late_payment).length || 0;
        const allMembersPaid = paidOnTime === totalMembers && totalMembers > 0;

        if (allMembersPaid && !currentCycle.payout_processed) {
          console.log('🎉 All members paid on time! Triggering immediate payout for cycle:', currentCycle.id);

          // ========== DUPLICATE PAYOUT GUARD ==========
          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          );

          const { data: existingPayout } = await supabaseAdmin
            .from('withdrawals')
            .select('id')
            .eq('chama_id', body.chama_id)
            .eq('cycle_id', currentCycle.id)
            .not('status', 'in', '("rejected","failed")')
            .maybeSingle();

          if (existingPayout) {
            console.log(`⚠️ Payout already exists for cycle ${currentCycle.id} — skipping immediate payout`);
          } else {
            // Claim the cycle atomically
            const { data: claimed } = await supabaseAdmin
              .rpc('claim_cycle_for_processing', { p_cycle_id: currentCycle.id });

            if (!claimed) {
              console.log(`⚠️ Cycle ${currentCycle.id} already claimed — skipping`);
            } else {
              const { data: chamaDetails } = await supabaseClient
                .from('chama')
                .select('id, name, contribution_amount, commission_rate')
                .eq('id', body.chama_id)
                .single();

              const { data: beneficiaryMember } = await supabaseClient
                .from('chama_members')
                .select(`id, user_id, member_code, order_index, missed_payments_count, requires_admin_verification, profiles!chama_members_user_id_fkey(full_name, phone)`)
                .eq('id', currentCycle.beneficiary_member_id)
                .single();

              if (beneficiaryMember && chamaDetails) {
                // Use available_balance — commission was already deducted per-contribution
                const { data: chamaBalanceData } = await supabaseAdmin
                  .from('chama')
                  .select('available_balance')
                  .eq('id', body.chama_id)
                  .single();

                const netPayoutAmount = chamaBalanceData?.available_balance || 0;
                const commissionAmount = 0; // Already collected per-contribution in settleDebts()
                const grossAmount = netPayoutAmount; // Pool is already net of commission

                const { data: paymentMethod } = await supabaseClient
                  .from('payment_methods')
                  .select('*')
                  .eq('user_id', beneficiaryMember.user_id)
                  .eq('is_default', true)
                  .maybeSingle();

                if (paymentMethod) {
                  const canAutoApprove = paymentMethod.method_type === 'mpesa' &&
                                         !beneficiaryMember.requires_admin_verification &&
                                         (beneficiaryMember.missed_payments_count || 0) === 0;

                  const { data: newWithdrawal, error: wdError } = await supabaseAdmin
                    .from('withdrawals')
                    .insert({
                      chama_id: body.chama_id,
                      cycle_id: currentCycle.id,  // Link to cycle for duplicate prevention
                      requested_by: beneficiaryMember.user_id,
                      amount: grossAmount,
                      commission_amount: commissionAmount,
                      net_amount: netPayoutAmount,
                      status: canAutoApprove ? 'approved' : 'pending',
                      payment_method_id: paymentMethod.id,
                      payment_method_type: paymentMethod.method_type,
                      notes: `Automatic immediate payout — all ${totalMembers} members paid | Cycle #${currentCycle.cycle_number}`,
                      requested_at: new Date().toISOString(),
                      b2c_attempt_count: 0,
                      ...(canAutoApprove ? { reviewed_at: new Date().toISOString() } : {})
                    })
                    .select('id')
                    .single();

                  if (wdError && wdError.code === '23505') {
                    console.log(`⚠️ Duplicate payout prevented by unique index for cycle ${currentCycle.id}`);
                  } else if (newWithdrawal) {
                    // Commission already collected per-contribution — no double-charge
                    // Skip record_company_earning here since it was done in settleDebts()

                    // Payout ledger entry
                    await supabaseAdmin.from('financial_ledger').insert({
                      transaction_type: 'payout',
                      source_type: 'chama',
                      source_id: body.chama_id,
                      gross_amount: grossAmount,
                      commission_amount: commissionAmount,
                      net_amount: netPayoutAmount,
                      commission_rate: commissionRate,
                      reference_id: newWithdrawal.id,
                      description: `Immediate full payout — Cycle #${currentCycle.cycle_number} to ${beneficiaryMember.member_code}. All ${totalMembers} members paid.`
                    });

                    // Audit log
                    await supabaseAdmin.from('audit_logs').insert({
                      action: 'IMMEDIATE_PAYOUT_CREATED',
                      table_name: 'withdrawals',
                      record_id: newWithdrawal.id,
                      new_values: {
                        cycle_id: currentCycle.id,
                        cycle_number: currentCycle.cycle_number,
                        beneficiary: beneficiaryMember.member_code,
                        gross: grossAmount,
                        commission: commissionAmount,
                        net: netPayoutAmount
                      }
                    });

                    await supabaseAdmin.from('contribution_cycles').update({
                      is_complete: true,
                      payout_amount: netPayoutAmount,
                      payout_type: 'full',
                      members_paid_count: totalMembers,
                      total_collected_amount: grossAmount
                    }).eq('id', currentCycle.id);

                    if (canAutoApprove && paymentMethod.phone_number) {
                      try {
                        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                        await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ withdrawal_id: newWithdrawal.id, phone_number: paymentMethod.phone_number, amount: netPayoutAmount })
                        });
                      } catch (e) { /* non-critical */ }
                    }
                  }
                }
              }
            }
          }
          }
        }


      return new Response(JSON.stringify({
        data: contributionData,
        payment_allocation: {
          allocations: settleResult.allocations,
          carry_forward: settleResult.carry_forward,
          total_to_company: settleResult.total_to_company,
          total_to_recipients: settleResult.total_to_recipients,
          total_to_cycle_pot: settleResult.total_to_cycle_pot,
          periods_cleared: settleResult.periods_cleared
        },
        first_payment: isFirstPayment ? { activated: true, order_index: assignedOrderIndex, member_code: assignedMemberCode } : null
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in contributions-crud:', error);
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record — payment may already exist';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';

    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
