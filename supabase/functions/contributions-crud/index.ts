import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentAllocation {
  cycle_id: string;
  cycle_number: number;
  amount_applied: number;
  commission_amount: number;
  commission_rate: number;
  type: 'missed_period' | 'current_period' | 'carry_forward';
  was_fully_paid: boolean;
}

interface AllocationResult {
  allocations: PaymentAllocation[];
  carry_forward: number;
  total_applied: number;
  total_commission: number;
  periods_cleared: number;
}

/**
 * Allocates payment with IMMEDIATE commission deduction.
 * 
 * RULES:
 * - On-time payments: 5% commission
 * - Late payments (missed cycles): 10% commission
 * - Commission is deducted FIRST from the gross payment
 * - Only NET funds are allocated to cycles
 * - Oldest unpaid cycles are cleared first
 * - Commission is NEVER used for payouts
 */
async function allocatePayment(
  supabase: any,
  memberId: string,
  chamaId: string,
  grossPaymentAmount: number,
  contributionAmount: number
): Promise<AllocationResult> {
  const allocations: PaymentAllocation[] = [];
  let periodsClosed = 0;
  let totalCommission = 0;

  const ONTIME_RATE = 0.05;
  const LATE_RATE = 0.10;

  // 1. Get member's current carry-forward credit (already net)
  const { data: member } = await supabase
    .from('chama_members')
    .select('carry_forward_credit')
    .eq('id', memberId)
    .single();
  
  const existingCarryForward = member?.carry_forward_credit || 0;

  // 2. Get ALL unpaid/partially-paid cycles (oldest first)
  const { data: unpaidCycles, error: cyclesError } = await supabase
    .from('member_cycle_payments')
    .select(`
      id,
      cycle_id,
      amount_due,
      amount_paid,
      amount_remaining,
      fully_paid,
      payment_allocations,
      contribution_cycles!inner(cycle_number, start_date, end_date)
    `)
    .eq('member_id', memberId)
    .eq('fully_paid', false)
    .order('contribution_cycles(start_date)', { ascending: true });

  if (cyclesError) {
    console.error('Error fetching unpaid cycles:', cyclesError);
  }

  const cycles = unpaidCycles || [];
  const now = new Date();

  // 3. Calculate how much gross is needed for each cycle (base + commission)
  //    and determine commission per cycle
  let remainingGross = grossPaymentAmount;
  
  console.log('Payment allocation starting:', {
    grossPaymentAmount,
    existingCarryForward,
    contributionAmount,
    unpaidCyclesCount: cycles.length
  });

  // Process each unpaid cycle
  for (const cycle of cycles) {
    if (remainingGross <= 0 && existingCarryForward <= 0) break;

    const cycleEndDate = new Date(cycle.contribution_cycles?.end_date);
    const isLate = now > cycleEndDate;
    const commissionRate = isLate ? LATE_RATE : ONTIME_RATE;
    
    const amountStillOwed = (cycle.amount_due || contributionAmount) - (cycle.amount_paid || 0);
    if (amountStillOwed <= 0) continue;

    // First, apply any existing carry-forward (already net, no commission)
    let netApplied = 0;
    let commissionCharged = 0;

    if (existingCarryForward > 0 && amountStillOwed > 0) {
      // Carry-forward is already net, no commission
      // But we track it separately - it was already accounted for in original allocation
    }

    // Calculate: to fill `amountStillOwed` of NET, the member needs to pay gross = net / (1 - rate)
    // But we simplify: deduct commission from gross first, then apply net
    const grossNeededForCycle = amountStillOwed / (1 - commissionRate);
    const grossToApply = Math.min(grossNeededForCycle, remainingGross);
    
    if (grossToApply > 0) {
      commissionCharged = grossToApply * commissionRate;
      netApplied = grossToApply - commissionCharged;
      remainingGross -= grossToApply;
      totalCommission += commissionCharged;
    }

    // Also apply carry-forward if needed (already net)
    const stillNeeded = amountStillOwed - netApplied;
    let carryForwardApplied = 0;
    // Note: carry-forward is handled at cycle creation, not here
    // This keeps the math clean

    const totalNetApplied = netApplied;
    const newAmountPaid = (cycle.amount_paid || 0) + totalNetApplied;
    const isFullyPaid = newAmountPaid >= (cycle.amount_due || contributionAmount);

    if (totalNetApplied > 0) {
      // Update cycle payment record
      const existingAllocations = cycle.payment_allocations || [];
      const newAllocation = {
        amount: totalNetApplied,
        gross_paid: grossToApply,
        commission: commissionCharged,
        commission_rate: commissionRate,
        timestamp: new Date().toISOString(),
        source: 'contribution',
        is_late: isLate
      };

      const { error: updateError } = await supabase
        .from('member_cycle_payments')
        .update({
          amount_paid: newAmountPaid,
          amount_remaining: Math.max(0, (cycle.amount_due || contributionAmount) - newAmountPaid),
          fully_paid: isFullyPaid,
          is_paid: isFullyPaid,
          is_late_payment: isLate,
          paid_at: isFullyPaid ? new Date().toISOString() : cycle.paid_at,
          payment_allocations: [...existingAllocations, newAllocation]
        })
        .eq('id', cycle.id);

      if (updateError) {
        console.error('Error updating cycle payment:', updateError);
      }

      if (isFullyPaid) periodsClosed++;

      allocations.push({
        cycle_id: cycle.cycle_id,
        cycle_number: cycle.contribution_cycles?.cycle_number || 0,
        amount_applied: totalNetApplied,
        commission_amount: commissionCharged,
        commission_rate: commissionRate,
        type: isLate ? 'missed_period' : 'current_period',
        was_fully_paid: isFullyPaid
      });

      console.log('Allocated to period:', {
        cycleNumber: cycle.contribution_cycles?.cycle_number,
        isLate,
        commissionRate: `${commissionRate * 100}%`,
        grossUsed: grossToApply,
        commissionCharged,
        netApplied: totalNetApplied,
        isFullyPaid
      });
    }
  }

  // 4. Any remaining gross after commission → carry-forward as net
  // Remaining gross has no specific cycle, so apply on-time rate
  let carryForward = existingCarryForward;
  if (remainingGross > 0) {
    const remainingCommission = remainingGross * ONTIME_RATE;
    const remainingNet = remainingGross - remainingCommission;
    totalCommission += remainingCommission;
    carryForward += remainingNet;
  }

  // 5. Update member carry-forward
  const { error: memberUpdateError } = await supabase
    .from('chama_members')
    .update({
      carry_forward_credit: carryForward,
      last_payment_date: new Date().toISOString()
    })
    .eq('id', memberId);

  if (memberUpdateError) {
    console.error('Error updating member carry-forward:', memberUpdateError);
  }

  // 6. Record commission in financial ledger and company earnings
  if (totalCommission > 0) {
    await supabase
      .from('company_earnings')
      .insert({
        source: 'chama_contribution',
        amount: totalCommission,
        group_id: chamaId,
        description: `Tiered commission on contribution of KES ${grossPaymentAmount}. On-time: 5%, Late: 10%.`
      });

    await supabase
      .from('financial_ledger')
      .insert({
        transaction_type: 'contribution',
        source_type: 'chama',
        source_id: chamaId,
        gross_amount: grossPaymentAmount,
        commission_amount: totalCommission,
        net_amount: grossPaymentAmount - totalCommission,
        commission_rate: totalCommission / grossPaymentAmount,
        description: `Tiered commission deducted at payment. Allocated to ${allocations.length} cycle(s).`
      });

    // Update chama financial tracking
    const { data: chamaData } = await supabase
      .from('chama')
      .select('total_gross_collected, total_commission_paid, available_balance')
      .eq('id', chamaId)
      .single();

    if (chamaData) {
      await supabase
        .from('chama')
        .update({
          total_gross_collected: (chamaData.total_gross_collected || 0) + grossPaymentAmount,
          total_commission_paid: (chamaData.total_commission_paid || 0) + totalCommission,
          available_balance: (chamaData.available_balance || 0) + (grossPaymentAmount - totalCommission),
        })
        .eq('id', chamaId);
    }
  }

  console.log('Payment allocation complete:', {
    totalAllocations: allocations.length,
    periodsClosed,
    totalCommission,
    carryForward,
    netApplied: grossPaymentAmount - totalCommission - (carryForward - existingCarryForward)
  });

  return {
    allocations,
    carry_forward: carryForward,
    total_applied: grossPaymentAmount - totalCommission,
    total_commission: totalCommission,
    periods_cleared: periodsClosed
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate Authorization header upfront
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Missing authorization header',
        code: 'AUTH_REQUIRED' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify authentication for all requests
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired token',
        code: 'AUTH_INVALID',
        details: authError?.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('contributions-crud request', { 
      method: req.method,
      userId: user.id,
      timestamp: new Date().toISOString()
    });

    const url = new URL(req.url);
    const chamaId = url.searchParams.get('chama_id');

    // GET /contributions-crud?chama_id=xxx - List contributions for a chama
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
          chama_members!contributions_member_id_fkey (
            member_code,
            profiles (
              full_name,
              email
            )
          ),
          paid_by:chama_members!contributions_paid_by_member_id_fkey (
            member_code,
            profiles (
              full_name,
              email
            )
          )
        `)
        .eq('chama_id', chamaId)
        .order('contribution_date', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /contributions-crud - Create new contribution
    if (req.method === 'POST') {
      const body = await req.json();

      console.log('Creating contribution:', body);
      
      // Verify KYC status
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

      // Validate member exists
      const { data: member, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('*, chama(contribution_amount, slug, name)')
        .eq('id', body.member_id)
        .maybeSingle();

      // Validate payer (if different from recipient)
      if (body.paid_by_member_id && body.paid_by_member_id !== body.member_id) {
        const { data: payer, error: payerError } = await supabaseClient
          .from('chama_members')
          .select('id, chama_id')
          .eq('id', body.paid_by_member_id)
          .maybeSingle();

        if (payerError || !payer || payer.chama_id !== member.chama_id) {
          return new Response(JSON.stringify({ error: 'Payer must be a member of the same chama' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (memberError || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const contributionAmount = member.chama.contribution_amount;

      // ============================================
      // FIRST PAYMENT ACTIVATION LOGIC
      // ============================================
      let isFirstPayment = false;
      let assignedOrderIndex: number | null = null;
      let assignedMemberCode: string | null = null;

      if (!member.first_payment_completed) {
        isFirstPayment = true;
        console.log('Processing FIRST PAYMENT for member:', member.id);

        // Get next available order_index using database function
        const { data: nextIndex, error: indexError } = await supabaseClient
          .rpc('get_next_order_index', { p_chama_id: member.chama_id });

        if (indexError) {
          console.error('Error getting next order index:', indexError);
          // Fallback: calculate manually
          const { data: existingMembers } = await supabaseClient
            .from('chama_members')
            .select('order_index')
            .eq('chama_id', member.chama_id)
            .not('order_index', 'is', null)
            .order('order_index', { ascending: false })
            .limit(1);
          
          assignedOrderIndex = existingMembers && existingMembers.length > 0
            ? (existingMembers[0].order_index || 0) + 1
            : 1;
        } else {
          assignedOrderIndex = nextIndex || 1;
        }

        // Generate member code
        const { data: memberCode } = await supabaseClient
          .rpc('generate_member_code', {
            p_chama_id: member.chama_id,
            p_order_index: assignedOrderIndex
          });

        assignedMemberCode = memberCode || member.member_code; // Keep existing code if RPC fails

        // Update member with first payment activation
        const { error: activationError } = await supabaseClient
          .from('chama_members')
          .update({
            first_payment_completed: true,
            first_payment_at: new Date().toISOString(),
            order_index: assignedOrderIndex,
            member_code: assignedMemberCode,
            status: 'active',
          })
          .eq('id', member.id);

        if (activationError) {
          console.error('Error activating member:', activationError);
        } else {
          console.log('Member activated with first payment:', {
            memberId: member.id,
            orderIndex: assignedOrderIndex,
            memberCode: assignedMemberCode
          });

          // Send SMS notification for first payment
          if (profile?.phone) {
            try {
              await supabaseClient.functions.invoke('send-transactional-sms', {
                body: {
                  phone: profile.phone,
                  message: `Payment received! You are now Member #${assignedOrderIndex} in "${member.chama.name}". Your member code is ${assignedMemberCode}. Your payout position is secured.`,
                  eventType: 'first_payment_received'
                }
              });
            } catch (smsError) {
              console.error('Failed to send first payment SMS:', smsError);
            }
          }
        }
      }

      // Create contribution record
      const { data, error } = await supabaseClient
        .from('contributions')
        .insert(body)
        .select()
        .maybeSingle();

      if (error) throw error;

      // ============================================
      // SCHEDULED CONTRIBUTIONS PAYMENT ALLOCATION
      // ============================================
      // Apply strict payment rules:
      // 1. Clear missed periods first (oldest to newest)
      // 2. Apply to current period (capped at contribution amount)
      // 3. Store excess as carry-forward
      
      const allocationResult = await allocatePayment(
        supabaseClient,
        body.member_id,
        body.chama_id,
        body.amount,
        contributionAmount
      );

      // Check for active cycle and handle current cycle tracking
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      const { data: cycle } = await supabaseClient
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', body.chama_id)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      let isLatePayment = false;
      
      if (cycle) {
        // Check if payment is after 8 PM on cycle end date
        const cycleEndDate = new Date(cycle.end_date);
        const cutoffTime = new Date(cycleEndDate);
        cutoffTime.setHours(20, 0, 0, 0); // 8:00 PM on end date

        isLatePayment = now > cutoffTime;

        if (isLatePayment) {
          // Late payment - any carry-forward already handled by allocatePayment
          // Send late payment notification
          const { data: memberProfile } = await supabaseClient
            .from('profiles')
            .select('phone')
            .eq('id', member.user_id)
            .single();

          if (memberProfile?.phone) {
            const nextCycleDate = new Date(cycle.end_date);
            nextCycleDate.setDate(nextCycleDate.getDate() + 1);
            
            await supabaseClient.functions.invoke('send-transactional-sms', {
              body: {
                phone: memberProfile.phone,
                message: `Your payment of KES ${body.amount} was received after 8 PM. Any excess has been credited for future cycles. Carry-forward: KES ${allocationResult.carry_forward}.`,
                eventType: 'late_payment_credit'
              }
            });
          }
        } else {
          // Ensure current cycle has a payment record (create if not exists)
          const { data: existingPayment } = await supabaseClient
            .from('member_cycle_payments')
            .select('id')
            .eq('member_id', body.member_id)
            .eq('cycle_id', cycle.id)
            .maybeSingle();

          if (!existingPayment) {
            // Create new payment record for this cycle - allocation will handle it
            await supabaseClient
              .from('member_cycle_payments')
              .insert({
                member_id: body.member_id,
                cycle_id: cycle.id,
                amount_paid: 0,
                amount_due: cycle.due_amount || contributionAmount,
                amount_remaining: cycle.due_amount || contributionAmount,
                is_paid: false,
                fully_paid: false,
                is_late_payment: false,
                payment_allocations: []
              });
          }
        }

        // Reset missed payment count if clearing periods
        if (allocationResult.periods_cleared > 0 && member.missed_payments_count > 0) {
          await supabaseClient
            .from('chama_members')
            .update({
              missed_payments_count: Math.max(0, member.missed_payments_count - allocationResult.periods_cleared),
              requires_admin_verification: member.missed_payments_count - allocationResult.periods_cleared >= 1
            })
            .eq('id', body.member_id);
      }
      }

      // Build allocation summary message
      let allocationSummary = '';
      if (allocationResult.allocations.length > 0) {
        const periodsSummary = allocationResult.allocations
          .map(a => `Cycle #${a.cycle_number}: KES ${a.amount_applied}${a.was_fully_paid ? ' ✓' : ''}`)
          .join(', ');
        allocationSummary = periodsSummary;
      }

      // Send allocation SMS if cleared multiple periods
      if (allocationResult.periods_cleared > 0 && profile?.phone) {
        try {
          await supabaseClient.functions.invoke('send-transactional-sms', {
            body: {
              phone: profile.phone,
              message: `Payment of KES ${body.amount} received. ✅ Cleared: ${allocationResult.periods_cleared} period(s). ${allocationResult.carry_forward > 0 ? `Carry-forward: KES ${allocationResult.carry_forward}` : 'All periods paid!'}`,
              eventType: 'payment_allocation'
            }
          });
        } catch (smsError) {
          console.error('Failed to send allocation SMS:', smsError);
        }
      }

      // ============================================
      // AUTOMATIC IMMEDIATE PAYOUT TRIGGER
      // When all members have paid for a cycle, trigger payout immediately
      // ============================================
      if (cycle) {
        // Check if all members have now paid
        const { data: allPaymentsCheck } = await supabaseClient
          .from('member_cycle_payments')
          .select('is_paid, is_late_payment')
          .eq('cycle_id', cycle.id);

        const totalMembers = allPaymentsCheck?.length || 0;
        const paidOnTime = allPaymentsCheck?.filter((p: any) => p.is_paid && !p.is_late_payment).length || 0;
        const allMembersPaid = paidOnTime === totalMembers && totalMembers > 0;

        if (allMembersPaid && !cycle.payout_processed) {
          console.log('🎉 All members paid! Triggering immediate payout for cycle:', cycle.id);
          
          // Get chama details for payout
          const { data: chamaDetails } = await supabaseClient
            .from('chama')
            .select('id, name, contribution_amount, commission_rate')
            .eq('id', body.chama_id)
            .single();

          // Get beneficiary for this cycle
          const { data: beneficiaryMember } = await supabaseClient
            .from('chama_members')
            .select(`
              id, user_id, member_code, order_index, 
              missed_payments_count, requires_admin_verification,
              profiles!chama_members_user_id_fkey(full_name, phone)
            `)
            .eq('id', cycle.beneficiary_member_id)
            .single();

          if (beneficiaryMember && chamaDetails) {
            // Calculate payout: each member's contribution × number of members, minus commission
            const commissionRate = chamaDetails.commission_rate || 0.05;
            const grossAmount = chamaDetails.contribution_amount * totalMembers;
            const commissionAmount = grossAmount * commissionRate;
            const netPayoutAmount = grossAmount - commissionAmount;

            console.log(`Immediate payout calculation: ${totalMembers} members × KES ${chamaDetails.contribution_amount} = KES ${grossAmount}, commission: KES ${commissionAmount}, net: KES ${netPayoutAmount}`);

            // Get beneficiary's payment method
            const { data: paymentMethod } = await supabaseClient
              .from('payment_methods')
              .select('*')
              .eq('user_id', beneficiaryMember.user_id)
              .eq('is_default', true)
              .maybeSingle();

            if (paymentMethod) {
              // Check if auto-approval is allowed (M-Pesa, no admin verification needed)
              const canAutoApprove = paymentMethod.method_type === 'mpesa' &&
                                     !beneficiaryMember.requires_admin_verification &&
                                     (beneficiaryMember.missed_payments_count || 0) === 0;

              const withdrawalStatus = canAutoApprove ? 'approved' : 'pending';

              // Create withdrawal request
              const { data: newWithdrawal, error: withdrawalError } = await supabaseClient
                .from('withdrawals')
                .insert({
                  chama_id: body.chama_id,
                  requested_by: beneficiaryMember.user_id,
                  amount: grossAmount,
                  commission_amount: commissionAmount,
                  net_amount: netPayoutAmount,
                  status: withdrawalStatus,
                  payment_method_id: paymentMethod.id,
                  payment_method_type: paymentMethod.method_type,
                  notes: `Automatic immediate payout - all ${totalMembers} members paid`,
                  requested_at: new Date().toISOString(),
                  b2c_attempt_count: 0,
                  ...(withdrawalStatus === 'approved' ? { reviewed_at: new Date().toISOString() } : {})
                })
                .select('id')
                .single();

              if (!withdrawalError && newWithdrawal) {
                // Record commission
                await supabaseClient.rpc('record_company_earning', {
                  p_source: 'chama_commission',
                  p_amount: commissionAmount,
                  p_group_id: body.chama_id,
                  p_description: `Immediate payout commission - ${chamaDetails.name} (all members paid)`
                });

                // Mark cycle as complete
                await supabaseClient
                  .from('contribution_cycles')
                  .update({
                    is_complete: true,
                    payout_processed: true,
                    payout_processed_at: new Date().toISOString(),
                    payout_amount: netPayoutAmount,
                    payout_type: 'full',
                    members_paid_count: totalMembers,
                    total_collected_amount: grossAmount
                  })
                  .eq('id', cycle.id);

                // Trigger automatic B2C payout if approved
                if (canAutoApprove && paymentMethod.phone_number) {
                  console.log('🚀 Triggering automatic B2C payout for immediate full payment');
                  
                  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

                  // Send SMS notification
                  const beneficiaryPhone = beneficiaryMember.profiles?.phone || paymentMethod.phone_number;
                  if (beneficiaryPhone) {
                    await supabaseClient.functions.invoke('send-transactional-sms', {
                      body: {
                        phone: beneficiaryPhone,
                        message: `🎉 Great news! All members have paid for "${chamaDetails.name}". Your payout of KES ${netPayoutAmount.toFixed(2)} is being processed now!`,
                        eventType: 'immediate_payout'
                      }
                    });
                  }

                  try {
                    const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${serviceKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        withdrawal_id: newWithdrawal.id,
                        phone_number: paymentMethod.phone_number,
                        amount: netPayoutAmount
                      })
                    });

                    const b2cResult = await b2cResponse.json();
                    if (b2cResponse.ok && b2cResult.success) {
                      console.log('✅ Immediate B2C payout initiated:', b2cResult.conversation_id);
                    } else {
                      console.error('⚠️ B2C payout failed, will retry:', b2cResult);
                      await supabaseClient
                        .from('withdrawals')
                        .update({
                          status: 'pending_retry',
                          b2c_attempt_count: 1,
                          last_b2c_attempt_at: new Date().toISOString(),
                          b2c_error_details: { error: b2cResult.error || 'B2C initiation failed' }
                        })
                        .eq('id', newWithdrawal.id);
                    }
                  } catch (b2cError: any) {
                    console.error('⚠️ B2C request error:', b2cError);
                  }
                } else if (!canAutoApprove) {
                  // Notify beneficiary that payout requires admin approval
                  const beneficiaryPhone = beneficiaryMember.profiles?.phone;
                  if (beneficiaryPhone) {
                    await supabaseClient.functions.invoke('send-transactional-sms', {
                      body: {
                        phone: beneficiaryPhone,
                        message: `🎉 All members have paid for "${chamaDetails.name}"! Your payout of KES ${netPayoutAmount.toFixed(2)} requires admin approval and will be processed soon.`,
                        eventType: 'immediate_payout_pending'
                      }
                    });
                  }
                }

                // Create notification for beneficiary
                await supabaseClient
                  .from('notifications')
                  .insert({
                    user_id: beneficiaryMember.user_id,
                    title: '🎉 Payout Ready!',
                    message: `All members have paid! Your payout of KES ${netPayoutAmount.toFixed(2)} from "${chamaDetails.name}" ${canAutoApprove ? 'is being sent to your M-Pesa' : 'requires admin approval'}.`,
                    type: 'success',
                    category: 'withdrawal'
                  });
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ 
        data,
        payment_allocation: {
          allocations: allocationResult.allocations,
          carry_forward: allocationResult.carry_forward,
          total_applied: allocationResult.total_applied,
          periods_cleared: allocationResult.periods_cleared,
          summary: allocationSummary
        },
        first_payment: isFirstPayment ? {
          activated: true,
          order_index: assignedOrderIndex,
          member_code: assignedMemberCode
        } : null
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
    console.error('Error in contributions-crud:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
