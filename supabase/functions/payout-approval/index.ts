import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { action } = body;

    if (action === 'list') {
      return handleList(supabase, body);
    }
    if (action === 'get-eligible-members') {
      return handleGetEligibleMembers(supabase, body);
    }
    if (action === 'approve') {
      return handleApprove(supabase, body);
    }
    if (action === 'reject') {
      return handleReject(supabase, body);
    }
    if (action === 'get-member-profile') {
      return handleGetMemberProfile(supabase, body);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error: any) {
    console.error('Payout approval error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ========== LIST ==========
async function handleList(supabase: any, body: any) {
  const { status: filterStatus } = body;

  let query = supabase
    .from('payout_approval_requests')
    .select(`
      *,
      chama:chama!payout_approval_requests_chama_id_fkey(id, name, contribution_amount, group_code, available_balance, max_members, current_cycle_round),
      cycle:contribution_cycles!payout_approval_requests_cycle_id_fkey(cycle_number, start_date, end_date),
      scheduled_member:chama_members!payout_approval_requests_scheduled_beneficiary_id_fkey(
        id, member_code, user_id,
        profiles!chama_members_user_id_fkey(full_name, phone)
      ),
      chosen_member_detail:chama_members!payout_approval_requests_chosen_member_id_fkey(
        id, member_code, user_id,
        profiles!chama_members_user_id_fkey(full_name, phone)
      ),
      reviewer:profiles!payout_approval_requests_reviewed_by_fkey(full_name)
    `)
    .order('created_at', { ascending: false });

  if (filterStatus) {
    query = query.eq('status', filterStatus);
  }

  const { data, error } = await query;

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ requests: data });
}

// ========== GET ELIGIBLE MEMBERS (enriched) ==========
async function handleGetEligibleMembers(supabase: any, body: any) {
  const { chamaId } = body;

  // Fetch chama details
  const { data: chama } = await supabase
    .from('chama')
    .select('id, name, contribution_amount, available_balance, group_code, max_members, current_cycle_round')
    .eq('id', chamaId)
    .single();

  if (!chama) return jsonResponse({ error: 'Chama not found' }, 404);

  // Fetch all active approved members
  const { data: members } = await supabase
    .from('chama_members')
    .select(`
      id, member_code, order_index, missed_payments_count, was_skipped, carry_forward_credit, user_id,
      profiles!chama_members_user_id_fkey(full_name, phone)
    `)
    .eq('chama_id', chamaId)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .order('order_index');

  const totalMembers = members?.length || 0;

  // Fetch all cycles to build payout history
  const { data: cycles } = await supabase
    .from('contribution_cycles')
    .select('id, cycle_number, beneficiary_member_id, payout_amount, payout_processed_at, start_date, end_date, is_complete')
    .eq('chama_id', chamaId)
    .order('cycle_number', { ascending: true });

  const totalCyclesCompleted = cycles?.filter((c: any) => c.is_complete)?.length || 0;

  // Build payout history with beneficiary names
  const memberMap = new Map<string, string>();
  for (const m of (members || [])) {
    memberMap.set(m.id, m.profiles?.full_name || m.member_code);
  }

  const payoutHistory = (cycles || [])
    .filter((c: any) => c.beneficiary_member_id && c.is_complete)
    .map((c: any) => ({
      cycle_number: c.cycle_number,
      beneficiary_id: c.beneficiary_member_id,
      beneficiary_name: memberMap.get(c.beneficiary_member_id) || 'Unknown',
      payout_amount: c.payout_amount || 0,
      date: c.payout_processed_at || c.end_date,
    }));

  // Determine current round: round = floor(completedCycles / totalMembers) + 1
  // Members who received in the current round are blocked
  const currentRound = totalMembers > 0 ? Math.floor(totalCyclesCompleted / totalMembers) : 0;
  const roundStartCycle = currentRound * totalMembers + 1;

  // Count payouts per member in this round
  const roundPayouts = new Map<string, number>();
  for (const ph of payoutHistory) {
    if (ph.cycle_number >= roundStartCycle) {
      roundPayouts.set(ph.beneficiary_id, (roundPayouts.get(ph.beneficiary_id) || 0) + 1);
    }
  }

  // Check if ALL members received in this round (new round starts)
  const allReceivedThisRound = totalMembers > 0 && roundPayouts.size >= totalMembers;

  // Enrich each member
  const membersWithDetails = [];
  for (const m of (members || [])) {
    // Unpaid cycles
    const { data: unpaid } = await supabase
      .from('member_cycle_payments')
      .select('id')
      .eq('member_id', m.id)
      .eq('fully_paid', false);

    // All cycle payments for success rate
    const { data: allPayments } = await supabase
      .from('member_cycle_payments')
      .select('id, fully_paid')
      .eq('member_id', m.id);

    const totalPayments = allPayments?.length || 0;
    const paidPayments = allPayments?.filter((p: any) => p.fully_paid)?.length || 0;
    const successRate = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 100;

    // Debts
    const { data: debts } = await supabase
      .from('chama_member_debts')
      .select('id')
      .eq('member_id', m.id)
      .eq('chama_id', chamaId)
      .in('status', ['outstanding', 'partial'])
      .limit(1);

    const hasDebts = debts && debts.length > 0;
    const unpaidCount = unpaid?.length || 0;
    const isEligible = unpaidCount === 0 && !hasDebts;

    // Payouts received overall
    const payoutsReceived = payoutHistory.filter((ph: any) => ph.beneficiary_id === m.id).length;
    const totalReceivedAmount = payoutHistory
      .filter((ph: any) => ph.beneficiary_id === m.id)
      .reduce((sum: number, ph: any) => sum + (ph.payout_amount || 0), 0);

    // Round guard
    const receivedThisRound = !allReceivedThisRound && (roundPayouts.get(m.id) || 0) > 0;

    // Trust score - use user_id from chama_members
    const { data: trustData } = await supabase
      .from('member_trust_scores')
      .select('trust_score')
      .eq('user_id', m.user_id || '')
      .maybeSingle();

    membersWithDetails.push({
      ...m,
      is_eligible: isEligible,
      unpaid_cycles: unpaidCount,
      has_debts: hasDebts,
      payouts_received: payoutsReceived,
      total_received_amount: totalReceivedAmount,
      already_received_this_round: receivedThisRound,
      trust_score: trustData?.trust_score ?? null,
      success_rate: successRate,
    });
  }

  return jsonResponse({
    members: membersWithDetails,
    chama_summary: {
      name: chama.name,
      group_code: chama.group_code,
      contribution_amount: chama.contribution_amount,
      available_balance: chama.available_balance,
      total_members: totalMembers,
      total_cycles_completed: totalCyclesCompleted,
      current_round: currentRound + 1,
      round_start_cycle: roundStartCycle,
      all_received_this_round: allReceivedThisRound,
    },
    payout_history: payoutHistory,
  });
}

// ========== APPROVE ==========
async function handleApprove(supabase: any, body: any) {
  const { requestId, chosenMemberId, adminNotes, adminUserId } = body;

  if (!requestId || !chosenMemberId) {
    return jsonResponse({ error: 'requestId and chosenMemberId required' }, 400);
  }

  // Get the approval request
  const { data: request, error: reqError } = await supabase
    .from('payout_approval_requests')
    .select('*, chama:chama!payout_approval_requests_chama_id_fkey(id, name, available_balance)')
    .eq('id', requestId)
    .eq('status', 'pending')
    .single();

  if (reqError || !request) {
    return jsonResponse({ error: 'Request not found or already processed' }, 404);
  }

  // ===== DOUBLE-PAYOUT GUARD =====
  const { data: allMembers } = await supabase
    .from('chama_members')
    .select('id')
    .eq('chama_id', request.chama_id)
    .eq('status', 'active')
    .eq('approval_status', 'approved');

  const totalMembers = allMembers?.length || 0;

  const { data: completedCycles } = await supabase
    .from('contribution_cycles')
    .select('id, cycle_number, beneficiary_member_id')
    .eq('chama_id', request.chama_id)
    .eq('is_complete', true)
    .order('cycle_number');

  const totalCompleted = completedCycles?.length || 0;
  const currentRound = totalMembers > 0 ? Math.floor(totalCompleted / totalMembers) : 0;
  const roundStartCycle = currentRound * totalMembers + 1;

  // Count payouts for chosen member in this round
  const roundPayoutsForChosen = (completedCycles || [])
    .filter((c: any) => c.cycle_number >= roundStartCycle && c.beneficiary_member_id === chosenMemberId)
    .length;

  // Check if all members have received this round
  const roundBeneficiaries = new Set(
    (completedCycles || [])
      .filter((c: any) => c.cycle_number >= roundStartCycle && c.beneficiary_member_id)
      .map((c: any) => c.beneficiary_member_id)
  );
  const allReceivedThisRound = totalMembers > 0 && roundBeneficiaries.size >= totalMembers;

  if (roundPayoutsForChosen > 0 && !allReceivedThisRound) {
    return jsonResponse({
      error: 'This member has already received a payout this round. Select another member who hasn\'t received yet.',
      already_received_this_round: true,
    }, 400);
  }

  // Get chosen member details
  const { data: chosenMember } = await supabase
    .from('chama_members')
    .select(`
      id, member_code, user_id, order_index, missed_payments_count, requires_admin_verification,
      profiles!chama_members_user_id_fkey(full_name, phone)
    `)
    .eq('id', chosenMemberId)
    .single();

  if (!chosenMember) {
    return jsonResponse({ error: 'Chosen member not found' }, 404);
  }

  // Get payment method
  const { data: paymentMethod } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', chosenMember.user_id)
    .eq('is_default', true)
    .maybeSingle();

  const payoutAmount = request.chama?.available_balance || request.payout_amount || 0;

  if (payoutAmount <= 0) {
    return jsonResponse({ error: 'No available balance for payout' }, 400);
  }

  // Create withdrawal
  const canAutoB2C = paymentMethod?.method_type === 'mpesa';
  const withdrawalStatus = canAutoB2C ? 'approved' : 'pending';

  const { data: withdrawal, error: wError } = await supabase
    .from('withdrawals')
    .insert({
      chama_id: request.chama_id,
      cycle_id: request.cycle_id,
      requested_by: chosenMember.user_id,
      amount: payoutAmount,
      commission_amount: 0,
      net_amount: payoutAmount,
      status: withdrawalStatus,
      payment_method_id: paymentMethod?.id,
      payment_method_type: paymentMethod?.method_type,
      notes: `Admin-approved payout. Chosen member: ${chosenMember.member_code}. ${adminNotes || ''}`,
      requested_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      b2c_attempt_count: 0,
    })
    .select('id')
    .single();

  if (wError) {
    if (wError.code === '23505') {
      return jsonResponse({ error: 'Payout already exists for this cycle' }, 409);
    }
    return jsonResponse({ error: wError.message }, 500);
  }

  // Update cycle
  await supabase
    .from('contribution_cycles')
    .update({
      beneficiary_member_id: chosenMemberId,
      payout_amount: payoutAmount,
      payout_type: 'admin_approved',
    })
    .eq('id', request.cycle_id);

  // Financial ledger entry
  await supabase.from('financial_ledger').insert({
    transaction_type: 'payout',
    source_type: 'chama',
    source_id: request.chama_id,
    gross_amount: payoutAmount,
    commission_amount: 0,
    net_amount: payoutAmount,
    commission_rate: 0,
    reference_id: withdrawal.id,
    description: `Admin-approved Cycle payout to ${chosenMember.member_code} (${chosenMember.profiles?.full_name})`,
  });

  // Trigger B2C if M-Pesa
  let b2cResult: any = null;
  if (canAutoB2C && paymentMethod?.phone_number) {
    try {
      const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          withdrawal_id: withdrawal.id,
          phone_number: paymentMethod.phone_number,
          amount: payoutAmount,
        }),
      });

      b2cResult = await b2cResponse.json();

      if (!b2cResponse.ok || !b2cResult.success) {
        await supabase
          .from('withdrawals')
          .update({
            status: 'pending_retry',
            b2c_attempt_count: 1,
            last_b2c_attempt_at: new Date().toISOString(),
            b2c_error_details: { error: b2cResult.error || 'B2C failed' },
          })
          .eq('id', withdrawal.id);
      } else {
        console.log(`✅ B2C initiated for admin-approved payout: ${b2cResult.conversation_id}`);
      }
    } catch (e: any) {
      console.error('B2C error:', e);
      await supabase
        .from('withdrawals')
        .update({
          status: 'pending_retry',
          b2c_attempt_count: 1,
          last_b2c_attempt_at: new Date().toISOString(),
          b2c_error_details: { error: e.message },
        })
        .eq('id', withdrawal.id);
    }
  }

  // Update approval request
  await supabase
    .from('payout_approval_requests')
    .update({
      status: 'approved',
      chosen_member_id: chosenMemberId,
      admin_notes: adminNotes || null,
      reviewed_by: adminUserId || null,
      reviewed_at: new Date().toISOString(),
      withdrawal_id: withdrawal.id,
      b2c_triggered: canAutoB2C,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // Audit log
  await supabase.from('audit_logs').insert({
    action: 'PAYOUT_ADMIN_APPROVED',
    table_name: 'payout_approval_requests',
    record_id: requestId,
    user_id: adminUserId || null,
    new_values: {
      chosen_member: chosenMember.member_code,
      payout_amount: payoutAmount,
      withdrawal_id: withdrawal.id,
      b2c_triggered: canAutoB2C,
    },
  });

  // Notify chosen member
  if (chosenMember.user_id) {
    await supabase.from('notifications').insert({
      user_id: chosenMember.user_id,
      title: 'Payout Approved',
      message: `You have been selected to receive the chama "${request.chama?.name}" payout of KES ${payoutAmount.toFixed(2)}. ${canAutoB2C ? 'Payment is being processed via M-Pesa.' : 'Payment will be processed shortly.'}`,
      type: 'success',
      category: 'chama',
      related_entity_id: request.chama_id,
      related_entity_type: 'chama',
    });
  }

  return jsonResponse({
    success: true,
    withdrawal_id: withdrawal.id,
    payout_amount: payoutAmount,
    b2c_triggered: canAutoB2C,
    b2c_result: b2cResult,
    chosen_member: chosenMember.member_code,
  });
}

// ========== REJECT ==========
async function handleReject(supabase: any, body: any) {
  const { requestId, adminNotes, adminUserId } = body;

  const { error } = await supabase
    .from('payout_approval_requests')
    .update({
      status: 'rejected',
      admin_notes: adminNotes || 'Rejected by admin',
      reviewed_by: adminUserId || null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) return jsonResponse({ error: error.message }, 500);

  await supabase.from('audit_logs').insert({
    action: 'PAYOUT_ADMIN_REJECTED',
    table_name: 'payout_approval_requests',
    record_id: requestId,
    user_id: adminUserId || null,
    new_values: { reason: adminNotes },
  });

  return jsonResponse({ success: true });
}

// ========== GET MEMBER PROFILE (cross-platform) ==========
async function handleGetMemberProfile(supabase: any, body: any) {
  const { userId } = body;
  if (!userId) return jsonResponse({ error: 'userId required' }, 400);

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, phone, email, kyc_status, created_at')
    .eq('id', userId)
    .single();

  // Chama memberships with payment stats
  const { data: chamaMemberships } = await supabase
    .from('chama_members')
    .select(`
      id, member_code, order_index, is_manager, status, approval_status, 
      total_contributed, missed_payments_count, carry_forward_credit, balance_deficit,
      joined_at, first_payment_completed,
      chama:chama!chama_members_chama_id_fkey(id, name, group_code, contribution_amount, status, contribution_frequency)
    `)
    .eq('user_id', userId)
    .neq('status', 'removed')
    .order('joined_at', { ascending: false });

  // For each chama, get payment success rate
  const chamaDetails = [];
  for (const cm of (chamaMemberships || [])) {
    const { data: payments } = await supabase
      .from('member_cycle_payments')
      .select('id, fully_paid, is_late_payment')
      .eq('member_id', cm.id);

    const total = payments?.length || 0;
    const paid = payments?.filter((p: any) => p.fully_paid)?.length || 0;
    const late = payments?.filter((p: any) => p.is_late_payment)?.length || 0;
    const successRate = total > 0 ? Math.round((paid / total) * 100) : 100;

    chamaDetails.push({
      chama_name: cm.chama?.name,
      group_code: cm.chama?.group_code,
      chama_status: cm.chama?.status,
      contribution_amount: cm.chama?.contribution_amount,
      frequency: cm.chama?.contribution_frequency,
      role: cm.is_manager ? 'Manager' : 'Member',
      member_status: cm.status,
      member_code: cm.member_code,
      position: cm.order_index,
      total_contributed: cm.total_contributed || 0,
      missed_payments: cm.missed_payments_count || 0,
      late_payments: late,
      total_cycles: total,
      paid_cycles: paid,
      success_rate: successRate,
      balance_deficit: cm.balance_deficit || 0,
      carry_forward: cm.carry_forward_credit || 0,
      joined_at: cm.joined_at,
    });
  }

  // Welfare memberships
  const { data: welfareMemberships } = await supabase
    .from('welfare_members')
    .select(`
      id, role, status, member_code, created_at,
      welfare:welfares!welfare_members_welfare_id_fkey(id, name, group_code, status)
    `)
    .eq('user_id', userId)
    .eq('status', 'active');

  const welfareDetails = (welfareMemberships || []).map((wm: any) => ({
    welfare_name: wm.welfare?.name,
    group_code: wm.welfare?.group_code,
    status: wm.welfare?.status,
    role: wm.role,
    member_code: wm.member_code,
    joined_at: wm.created_at,
  }));

  // Mchango campaigns (as creator or manager)
  const { data: mchangoCreated } = await supabase
    .from('mchango')
    .select('id, title, group_code, status, target_amount, current_amount, created_at')
    .eq('created_by', userId);

  const { data: mchangoManaged } = await supabase
    .from('mchango')
    .select('id, title, group_code, status, target_amount, current_amount')
    .contains('managers', [userId]);

  // Combine and deduplicate
  const allMchangos = new Map();
  for (const m of (mchangoCreated || [])) {
    allMchangos.set(m.id, { ...m, role: 'Creator' });
  }
  for (const m of (mchangoManaged || [])) {
    if (!allMchangos.has(m.id)) {
      allMchangos.set(m.id, { ...m, role: 'Manager' });
    }
  }

  const campaignDetails = Array.from(allMchangos.values()).map((m: any) => ({
    title: m.title,
    group_code: m.group_code,
    status: m.status,
    role: m.role,
    target_amount: m.target_amount,
    current_amount: m.current_amount,
  }));

  // Trust score
  const { data: trustData } = await supabase
    .from('member_trust_scores')
    .select('trust_score, total_on_time_payments, total_late_payments, total_missed_payments, total_chamas_completed')
    .eq('user_id', userId)
    .maybeSingle();

  return jsonResponse({
    profile,
    chamas: chamaDetails,
    welfares: welfareDetails,
    campaigns: campaignDetails,
    trust: trustData || null,
    summary: {
      total_chamas: chamaDetails.length,
      active_chamas: chamaDetails.filter(c => c.chama_status === 'active').length,
      total_welfares: welfareDetails.length,
      total_campaigns: campaignDetails.length,
      manager_roles: chamaDetails.filter(c => c.role === 'Manager').length,
      overall_success_rate: chamaDetails.length > 0
        ? Math.round(chamaDetails.reduce((sum, c) => sum + c.success_rate, 0) / chamaDetails.length)
        : 100,
    },
  });
}
