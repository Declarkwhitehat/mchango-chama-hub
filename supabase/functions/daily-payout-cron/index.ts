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

// Check if a member is eligible for payout based on their contributions
async function checkMemberEligibility(supabase: any, memberId: string, chamaId: string, contributionAmount: number, orderIndex: number) {
  // Required amount = contribution_amount × order_index (all contributions up to their turn)
  const requiredAmount = contributionAmount * orderIndex;
  
  // Get total completed contributions for this member
  const { data: contributions, error } = await supabase
    .from('contributions')
    .select('amount')
    .eq('member_id', memberId)
    .eq('status', 'completed');

  if (error) {
    console.error('Error fetching contributions:', error);
    return { isEligible: false, required: requiredAmount, contributed: 0, shortfall: requiredAmount };
  }

  const totalContributed = contributions?.reduce((sum: number, c: any) => sum + Number(c.amount), 0) || 0;
  const shortfall = Math.max(requiredAmount - totalContributed, 0);

  return {
    isEligible: totalContributed >= requiredAmount,
    required: requiredAmount,
    contributed: totalContributed,
    shortfall
  };
}

// Find the next eligible member in the payout queue
async function findNextEligibleMember(supabase: any, chamaId: string, contributionAmount: number, startPosition: number) {
  // Get all approved, active members who haven't received payout, ordered by order_index
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

  // Check each member's eligibility
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

// Record a payout skip in the database
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

  // Update the member's status
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[CRON] Daily payout started at:', new Date().toISOString());

    const today = new Date().toISOString().split('T')[0];

    // Get all active chamas (all frequencies)
    const { data: chamas, error: chamasError } = await supabase
      .from('chama')
      .select('id, name, contribution_amount, commission_rate, contribution_frequency')
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
      // Get cycle where end_date is today (payout due today)
      const { data: cycle } = await supabase
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
        .eq('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      if (!cycle) {
        console.log(`No unprocessed cycle for chama ${chama.name}`);
        continue;
      }

      // ========== ELIGIBILITY CHECK ==========
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
      let skippedMemberId = null;

      // If scheduled beneficiary is NOT eligible, skip them and find next eligible
      if (!eligibility.isEligible) {
        console.log(`⚠️ Member ${scheduledBeneficiary.member_code} NOT ELIGIBLE for payout.`);
        console.log(`   Required: ${eligibility.required}, Contributed: ${eligibility.contributed}, Shortfall: ${eligibility.shortfall}`);

        wasSkipped = true;
        skippedMemberId = scheduledBeneficiary.id;

        // Record the skip
        await recordPayoutSkip(
          supabase,
          chama.id,
          scheduledBeneficiary.id,
          cycle.id,
          scheduledBeneficiary.order_index,
          null, // Will be updated when they complete contributions
          eligibility.shortfall,
          eligibility.contributed,
          `Incomplete contributions: paid KES ${eligibility.contributed}, required KES ${eligibility.required}`
        );

        // Send skip notification SMS
        const skipPhone = scheduledBeneficiary.profiles?.phone;
        if (skipPhone) {
          const skipMessage = `⚠️ Your chama "${chama.name}" payout was SKIPPED today. Reason: Incomplete contributions. You paid KES ${eligibility.contributed} but need KES ${eligibility.required}. Please complete your contributions to be rescheduled.`;
          await sendSMS(skipPhone, skipMessage);
        }

        skipsProcessed++;

        // Find next eligible member
        const nextEligible = await findNextEligibleMember(
          supabase,
          chama.id,
          chama.contribution_amount,
          scheduledBeneficiary.order_index + 1
        );

        if (!nextEligible) {
          console.log(`No eligible members found for payout in chama ${chama.name}. Skipping payout.`);
          
          // Mark cycle as processed but with no payout
          await supabase
            .from('contribution_cycles')
            .update({
              payout_processed: true,
              payout_processed_at: new Date().toISOString(),
              payout_amount: 0,
              payout_type: 'skipped',
              members_skipped_count: 1
            })
            .eq('id', cycle.id);

          continue;
        }

        actualBeneficiary = nextEligible.member;
        console.log(`✅ Next eligible member: ${actualBeneficiary.member_code} (position ${actualBeneficiary.order_index})`);
      }

      // ========== PROCESS PAYOUT ==========
      // Get payment status for the cycle
      const { data: payments } = await supabase
        .from('member_cycle_payments')
        .select('*, chama_members!member_id(*)')
        .eq('cycle_id', cycle.id);

      const totalMembers = payments?.length || 0;
      const paidMembers = payments?.filter((p: any) => p.is_paid && !p.is_late_payment) || [];
      const paidCount = paidMembers.length;
      const unpaidMembers = payments?.filter((p: any) => !p.is_paid) || [];

      // Calculate payout amount from all contributions
      const collectedAmount = paidMembers.reduce((sum: number, p: any) => sum + (p.amount_paid || 0), 0);
      const commissionRate = chama.commission_rate || 0.05;
      const commissionAmount = collectedAmount * commissionRate;
      const payoutAmount = collectedAmount - commissionAmount;

      const isFullPayout = paidCount === totalMembers;
      const payoutType = wasSkipped ? 'redirected' : (isFullPayout ? 'full' : 'partial');

      console.log(`Processing ${payoutType} payout for ${chama.name}: ${paidCount}/${totalMembers} paid, amount: ${payoutAmount}`);

      // Get beneficiary payment method
      const { data: paymentMethod } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', actualBeneficiary.user_id)
        .eq('is_default', true)
        .maybeSingle();

      if (!paymentMethod && payoutAmount > 0) {
        console.error(`No payment method for beneficiary ${actualBeneficiary.member_code}`);
        errors++;
        continue;
      }

      // Create withdrawal request
      if (payoutAmount > 0) {
        const withdrawalStatus = actualBeneficiary.requires_admin_verification ? 'pending' : 'approved';
        
        const withdrawalNotes = wasSkipped 
          ? `Redirected payout - Original recipient (${scheduledBeneficiary.member_code}) skipped due to incomplete contributions. ${payoutType} (${paidCount}/${totalMembers} members paid)`
          : `Daily payout - ${payoutType} (${paidCount}/${totalMembers} members paid)`;

        const { error: withdrawalError } = await supabase
          .from('withdrawals')
          .insert({
            chama_id: chama.id,
            requested_by: actualBeneficiary.user_id,
            amount: collectedAmount,
            commission_amount: commissionAmount,
            net_amount: payoutAmount,
            status: withdrawalStatus,
            payment_method_id: paymentMethod?.id,
            payment_method_type: paymentMethod?.method_type,
            notes: withdrawalNotes,
            requested_at: new Date().toISOString(),
            ...(withdrawalStatus === 'approved' ? { reviewed_at: new Date().toISOString() } : {})
          });

        if (withdrawalError) {
          console.error('Error creating withdrawal:', withdrawalError);
          errors++;
          continue;
        }

        // Record commission earning
        await supabase.rpc('record_company_earning', {
          p_source: 'chama_commission',
          p_amount: commissionAmount,
          p_group_id: chama.id,
          p_description: `Daily payout commission - ${chama.name}`
        });
      }

      // Update cycle
      await supabase
        .from('contribution_cycles')
        .update({
          payout_processed: true,
          payout_processed_at: new Date().toISOString(),
          payout_amount: payoutAmount,
          payout_type: payoutType,
          members_paid_count: paidCount,
          members_skipped_count: wasSkipped ? 1 : 0,
          total_collected_amount: collectedAmount
        })
        .eq('id', cycle.id);

      // Send payout notification to actual beneficiary
      const beneficiaryPhone = actualBeneficiary.profiles?.phone;
      if (beneficiaryPhone) {
        const message = wasSkipped
          ? `🎉 Great news! You're receiving the chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} today! The original recipient was skipped due to incomplete contributions. ${actualBeneficiary.requires_admin_verification ? 'Pending admin approval.' : "You'll receive it shortly."}`
          : isFullPayout
            ? `Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} has been processed. Full payout - all members contributed! ${actualBeneficiary.requires_admin_verification ? 'Pending admin approval.' : "You'll receive it shortly."}`
            : `Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} has been processed. Partial payout (${paidCount}/${totalMembers} members paid). ${actualBeneficiary.requires_admin_verification ? 'Pending admin approval.' : "You'll receive it shortly."}`;
        
        await sendSMS(beneficiaryPhone, message);
      }

      // Update missed payment counts for unpaid members
      for (const unpaid of unpaidMembers) {
        const member = unpaid.chama_members;
        const newMissedCount = (member.missed_payments_count || 0) + 1;

        await supabase
          .from('chama_members')
          .update({
            missed_payments_count: newMissedCount,
            requires_admin_verification: newMissedCount >= 1
          })
          .eq('id', member.id);

        // Alert manager if member missed 2 payments
        if (newMissedCount >= 2) {
          const { data: manager } = await supabase
            .from('chama_members')
            .select('profiles!chama_members_user_id_fkey(phone)')
            .eq('chama_id', chama.id)
            .eq('is_manager', true)
            .maybeSingle();

          if (manager?.profiles?.phone) {
            const alertMessage = `Alert: Member ${member.profiles?.full_name} (${member.member_code}) has missed ${newMissedCount} contributions in your Chama "${chama.name}". Please follow up.`;
            await sendSMS(manager.profiles.phone, alertMessage);
          }
        }
      }

      // Check if cycle is complete (all approved members received payout)
      const { data: allCycles } = await supabase
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

      // If everyone got their payout turn, mark cycle as complete
      if (allCycles && allMembers && allCycles.length >= allMembers.length) {
        console.log(`🎉 Full cycle complete for chama ${chama.name}`);

        // Record cycle completion
        const { error: historyError } = await supabase
          .from('chama_cycle_history')
          .insert({
            chama_id: chama.id,
            cycle_round: chama.current_cycle_round || 1,
            started_at: chama.created_at,
            completed_at: new Date().toISOString(),
            total_members: allMembers.length,
            total_payouts_made: allCycles.length
          });

        if (historyError) {
          console.error('Error recording cycle history:', historyError);
        }

        // Update chama status
        const { error: statusError } = await supabase
          .from('chama')
          .update({
            last_cycle_completed_at: new Date().toISOString(),
            accepting_rejoin_requests: true,
            status: 'cycle_complete'
          })
          .eq('id', chama.id);

        if (statusError) {
          console.error('Error updating chama status:', statusError);
        } else {
          // Trigger cycle completion notifications
          try {
            await supabase.functions.invoke('chama-cycle-complete', {
              body: { chamaId: chama.id }
            });
            console.log('Triggered cycle completion notifications');
          } catch (invokeError) {
            console.error('Error invoking cycle-complete function:', invokeError);
          }
        }
      }

      payoutsProcessed++;
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
