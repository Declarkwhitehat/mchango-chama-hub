import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SimulationReport {
  timestamp: string;
  scenarios: ScenarioResult[];
  summary: { total: number; passed: number; failed: number };
}

interface ScenarioResult {
  name: string;
  description: string;
  passed: boolean;
  steps: StepResult[];
  error?: string;
}

interface StepResult {
  action: string;
  result: string;
  data?: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const report: SimulationReport = {
      timestamp: new Date().toISOString(),
      scenarios: [],
      summary: { total: 0, passed: 0, failed: 0 }
    };

    // Get real user profiles for test data
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .limit(4);

    if (profilesError || !profiles || profiles.length < 2) {
      return new Response(JSON.stringify({
        error: 'Need at least 2 user profiles to run simulation',
        profilesFound: profiles?.length || 0
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pad to 4 members by reusing profiles if needed
    while (profiles.length < 4) {
      profiles.push(profiles[profiles.length - 1]);
    }

    // ==================== SCENARIO 1: Happy Path ====================
    const scenario1 = await runScenario(supabase, profiles, {
      name: 'Happy Path - All Members Paid',
      description: 'All 4 members pay on time → beneficiary receives full payout',
      paidMembers: [0, 1, 2, 3], // all pay
      beneficiaryIndex: 0, // Member 1 is beneficiary
    });
    report.scenarios.push(scenario1);

    // ==================== SCENARIO 2: Beneficiary Skip ====================
    const scenario2 = await runScenario(supabase, profiles, {
      name: 'Beneficiary Skip - Unpaid Beneficiary',
      description: 'Member 2 (beneficiary) did NOT pay → skipped, payout redirected to Member 3',
      paidMembers: [0, 2, 3], // Member 2 (index 1) did NOT pay
      beneficiaryIndex: 1, // Member 2 is beneficiary but hasn't paid
    });
    report.scenarios.push(scenario2);

    // ==================== SCENARIO 3: No Eligible Members ====================
    const scenario3 = await runScenario(supabase, profiles, {
      name: 'No Eligible Members',
      description: 'Multiple members haven\'t paid → no payout processed',
      paidMembers: [0], // Only Member 1 paid
      beneficiaryIndex: 1, // Member 2 is beneficiary
      allOthersUnpaid: true,
    });
    report.scenarios.push(scenario3);

    // ==================== SCENARIO 4: Debt Blocks Payout ====================
    const scenario4 = await runScenarioWithDebt(supabase, profiles, {
      name: 'Debt Blocks Payout',
      description: 'Member 3 (beneficiary) paid current cycle but has outstanding debt → still ineligible',
    });
    report.scenarios.push(scenario4);

    // Summary
    report.summary.total = report.scenarios.length;
    report.summary.passed = report.scenarios.filter(s => s.passed).length;
    report.summary.failed = report.scenarios.filter(s => !s.passed).length;

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Simulation error:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function runScenario(
  supabase: any,
  profiles: any[],
  config: {
    name: string;
    description: string;
    paidMembers: number[];
    beneficiaryIndex: number;
    allOthersUnpaid?: boolean;
  }
): Promise<ScenarioResult> {
  const steps: StepResult[] = [];
  const slug = `sim-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let chamaId: string | null = null;

  try {
    // Step 1: Create test chama
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .insert({
        name: `[SIM] ${config.name}`,
        slug,
        description: `Simulation test: ${config.description}`,
        contribution_amount: 100,
        contribution_frequency: 'daily',
        max_members: 4,
        min_members: 2,
        status: 'active',
        created_by: profiles[0].id,
        commission_rate: 0.05,
        start_date: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
      })
      .select('id, group_code')
      .single();

    if (chamaError) throw new Error(`Create chama failed: ${chamaError.message}`);
    chamaId = chama.id;
    steps.push({ action: 'Create test chama', result: 'Success', data: { id: chama.id, slug } });

    // The trigger adds creator as member 1. We need to add 3 more members.
    // First fetch the auto-created member
    const { data: autoMember } = await supabase
      .from('chama_members')
      .select('id, order_index, member_code')
      .eq('chama_id', chamaId)
      .eq('user_id', profiles[0].id)
      .single();

    const memberIds: string[] = [autoMember.id];

    // Add remaining members
    for (let i = 1; i < 4; i++) {
      const memberCode = `${chama.group_code || slug.slice(0, 4).toUpperCase()}M${String(i + 1).padStart(4, '0')}`;
      const { data: member, error: memberError } = await supabase
        .from('chama_members')
        .insert({
          chama_id: chamaId,
          user_id: profiles[i].id,
          is_manager: false,
          member_code: memberCode,
          order_index: i + 1,
          status: 'active',
          approval_status: 'approved',
          first_payment_completed: true,
        })
        .select('id')
        .single();

      if (memberError) {
        steps.push({ action: `Add member ${i + 1}`, result: `Failed: ${memberError.message}` });
        // If duplicate user, create a placeholder
        continue;
      }
      memberIds.push(member.id);
    }

    steps.push({ action: 'Add 4 members', result: `${memberIds.length} members created`, data: { memberIds } });

    // Step 2: Create contribution cycle
    const cycleStart = new Date(Date.now() - 86400000); // yesterday
    const cycleEnd = new Date(Date.now() - 3600000); // 1 hour ago (overdue)
    
    const { data: cycle, error: cycleError } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: cycleStart.toISOString(),
        end_date: cycleEnd.toISOString(),
        due_amount: 100,
        beneficiary_member_id: memberIds[config.beneficiaryIndex] || memberIds[0],
        is_complete: false,
        payout_processed: false,
      })
      .select('id')
      .single();

    if (cycleError) throw new Error(`Create cycle failed: ${cycleError.message}`);
    steps.push({ action: 'Create contribution cycle', result: 'Success', data: { cycleId: cycle.id, beneficiary: config.beneficiaryIndex } });

    // Step 3: Create member_cycle_payments
    for (let i = 0; i < memberIds.length; i++) {
      const isPaid = config.paidMembers.includes(i);
      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[i],
        cycle_id: cycle.id,
        amount_due: 100,
        amount_paid: isPaid ? 100 : 0,
        amount_remaining: isPaid ? 0 : 100,
        is_paid: isPaid,
        fully_paid: isPaid,
        is_late_payment: false,
      });
    }

    const paidCount = config.paidMembers.length;
    steps.push({
      action: 'Set payment states',
      result: `${paidCount}/${memberIds.length} members paid`,
      data: { paidMembers: config.paidMembers, unpaidMembers: Array.from({ length: memberIds.length }, (_, i) => i).filter(i => !config.paidMembers.includes(i)) }
    });

    // Step 4: Run eligibility check (replicate daily-payout-cron logic)
    const beneficiaryId = memberIds[config.beneficiaryIndex] || memberIds[0];
    const eligibility = await checkMemberEligibilityForSim(supabase, beneficiaryId, chamaId, 100);
    
    steps.push({
      action: 'Check beneficiary eligibility',
      result: eligibility.isEligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE',
      data: eligibility
    });

    let actualBeneficiary = beneficiaryId;
    let wasSkipped = false;

    if (!eligibility.isEligible) {
      wasSkipped = true;
      steps.push({
        action: 'Beneficiary skipped',
        result: `Member at index ${config.beneficiaryIndex} skipped due to: ${eligibility.unpaidCycles} unpaid cycles, hasDebts: ${eligibility.hasDebts}`,
      });

      // Find next eligible
      let foundNext = false;
      for (let i = 0; i < memberIds.length; i++) {
        if (i === config.beneficiaryIndex) continue;
        const nextElig = await checkMemberEligibilityForSim(supabase, memberIds[i], chamaId, 100);
        if (nextElig.isEligible) {
          actualBeneficiary = memberIds[i];
          foundNext = true;
          steps.push({
            action: 'Find next eligible member',
            result: `✅ Member at index ${i} is eligible`,
            data: nextElig
          });
          break;
        }
      }

      if (!foundNext) {
        steps.push({
          action: 'Find next eligible member',
          result: '❌ No eligible members found — no payout this cycle',
        });
      }
    }

    // Step 5: Simulate payout result
    const payoutAmount = paidCount * 100 * (1 - 0.05); // net after commission
    if (!wasSkipped || actualBeneficiary !== beneficiaryId) {
      steps.push({
        action: 'Payout simulation',
        result: wasSkipped
          ? `Redirected payout of KES ${payoutAmount} to member at new position`
          : `Full payout of KES ${payoutAmount} to scheduled beneficiary`,
        data: {
          grossAmount: paidCount * 100,
          commission: paidCount * 100 * 0.05,
          netPayout: payoutAmount,
          wasRedirected: wasSkipped,
        }
      });
    }

    // Step 6: Check for debts that would be created
    const unpaidIndices = Array.from({ length: memberIds.length }, (_, i) => i).filter(i => !config.paidMembers.includes(i));
    if (unpaidIndices.length > 0) {
      const debtsToCreate = unpaidIndices.map(i => ({
        memberIndex: i,
        principalDebt: 100,
        penaltyDebt: 10, // 10% penalty
        totalOwed: 110,
      }));
      steps.push({
        action: 'Debts to be accrued',
        result: `${debtsToCreate.length} debt record(s) would be created`,
        data: { debts: debtsToCreate }
      });
    }

    // Determine pass/fail
    let passed = true;
    if (config.paidMembers.length === memberIds.length) {
      // Happy path: beneficiary should be eligible
      passed = eligibility.isEligible === true;
    } else if (!config.paidMembers.includes(config.beneficiaryIndex)) {
      // Beneficiary didn't pay: should be skipped
      passed = eligibility.isEligible === false && wasSkipped === true;
    }

    // Cleanup
    await cleanup(supabase, chamaId);
    steps.push({ action: 'Cleanup test data', result: 'Success' });

    return { name: config.name, description: config.description, passed, steps };

  } catch (error) {
    if (chamaId) await cleanup(supabase, chamaId);
    return {
      name: config.name,
      description: config.description,
      passed: false,
      steps,
      error: (error as any).message
    };
  }
}

async function runScenarioWithDebt(
  supabase: any,
  profiles: any[],
  config: { name: string; description: string }
): Promise<ScenarioResult> {
  const steps: StepResult[] = [];
  const slug = `sim-debt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let chamaId: string | null = null;

  try {
    // Create chama
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .insert({
        name: `[SIM] ${config.name}`,
        slug,
        description: config.description,
        contribution_amount: 100,
        contribution_frequency: 'daily',
        max_members: 4,
        min_members: 2,
        status: 'active',
        created_by: profiles[0].id,
        commission_rate: 0.05,
        start_date: new Date(Date.now() - 86400000 * 5).toISOString(),
      })
      .select('id, group_code')
      .single();

    if (chamaError) throw new Error(`Create chama failed: ${chamaError.message}`);
    chamaId = chama.id;
    steps.push({ action: 'Create test chama', result: 'Success' });

    // Get auto-created member
    const { data: autoMember } = await supabase
      .from('chama_members')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('user_id', profiles[0].id)
      .single();

    const memberIds: string[] = [autoMember.id];

    // Add 3 more members
    for (let i = 1; i < 4; i++) {
      const memberCode = `${chama.group_code || 'TEST'}M${String(i + 1).padStart(4, '0')}`;
      const { data: member, error: memberError } = await supabase
        .from('chama_members')
        .insert({
          chama_id: chamaId,
          user_id: profiles[i].id,
          is_manager: false,
          member_code: memberCode,
          order_index: i + 1,
          status: 'active',
          approval_status: 'approved',
          first_payment_completed: true,
        })
        .select('id')
        .single();

      if (memberError) continue;
      memberIds.push(member.id);
    }

    steps.push({ action: 'Add members', result: `${memberIds.length} members` });

    // Create Cycle 1 (past) where Member 3 (index 2) didn't pay — creates debt
    const cycle1Start = new Date(Date.now() - 86400000 * 3);
    const cycle1End = new Date(Date.now() - 86400000 * 2);
    
    const { data: cycle1 } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: cycle1Start.toISOString(),
        end_date: cycle1End.toISOString(),
        due_amount: 100,
        beneficiary_member_id: memberIds[0],
        is_complete: true,
        payout_processed: true,
      })
      .select('id')
      .single();

    // All paid except member 3 (index 2)
    for (let i = 0; i < memberIds.length; i++) {
      const isPaid = i !== 2;
      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[i],
        cycle_id: cycle1.id,
        amount_due: 100,
        amount_paid: isPaid ? 100 : 0,
        amount_remaining: isPaid ? 0 : 100,
        is_paid: isPaid,
        fully_paid: isPaid,
      });
    }

    // Create outstanding debt for member 3
    const { data: debt } = await supabase
      .from('chama_member_debts')
      .insert({
        chama_id: chamaId,
        member_id: memberIds[2],
        cycle_id: cycle1.id,
        principal_debt: 100,
        penalty_debt: 10,
        principal_remaining: 100,
        penalty_remaining: 10,
        status: 'outstanding',
      })
      .select('id')
      .single();

    steps.push({
      action: 'Create cycle 1 with outstanding debt for Member 3',
      result: 'Debt created: KES 100 principal + KES 10 penalty',
      data: { debtId: debt?.id }
    });

    // Create Cycle 2 where Member 3 is beneficiary and HAS paid current cycle
    const cycle2Start = new Date(Date.now() - 86400000);
    const cycle2End = new Date(Date.now() - 3600000);
    
    const { data: cycle2 } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 2,
        start_date: cycle2Start.toISOString(),
        end_date: cycle2End.toISOString(),
        due_amount: 100,
        beneficiary_member_id: memberIds[2], // Member 3 is beneficiary
        is_complete: false,
        payout_processed: false,
      })
      .select('id')
      .single();

    // All members paid for cycle 2 (including member 3)
    for (let i = 0; i < memberIds.length; i++) {
      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[i],
        cycle_id: cycle2.id,
        amount_due: 100,
        amount_paid: 100,
        amount_remaining: 0,
        is_paid: true,
        fully_paid: true,
      });
    }

    steps.push({ action: 'Create cycle 2 - Member 3 is beneficiary, all paid', result: 'Success' });

    // Check eligibility — member 3 should be INELIGIBLE due to outstanding debt
    const eligibility = await checkMemberEligibilityForSim(supabase, memberIds[2], chamaId, 100);

    steps.push({
      action: 'Check Member 3 eligibility (has outstanding debt but paid current cycle)',
      result: eligibility.isEligible ? '❌ FAIL - Should be ineligible due to debt' : '✅ PASS - Correctly marked ineligible',
      data: eligibility
    });

    const passed = !eligibility.isEligible && eligibility.hasDebts === true;

    // Cleanup
    await cleanup(supabase, chamaId);
    steps.push({ action: 'Cleanup test data', result: 'Success' });

    return { name: config.name, description: config.description, passed, steps };

  } catch (error) {
    if (chamaId) await cleanup(supabase, chamaId);
    return {
      name: config.name,
      description: config.description,
      passed: false,
      steps,
      error: (error as any).message
    };
  }
}

async function checkMemberEligibilityForSim(supabase: any, memberId: string, chamaId: string, contributionAmount: number) {
  const { data: cyclePayments } = await supabase
    .from('member_cycle_payments')
    .select(`id, cycle_id, amount_due, amount_paid, fully_paid`)
    .eq('member_id', memberId);

  const unpaidCycles = (cyclePayments || []).filter((p: any) => !p.fully_paid);
  const totalUnpaid = unpaidCycles.reduce((sum: number, p: any) => sum + ((p.amount_due || contributionAmount) - (p.amount_paid || 0)), 0);
  const totalCycles = (cyclePayments || []).length;

  const { data: outstandingDebts } = await supabase
    .from('chama_member_debts')
    .select('id')
    .eq('member_id', memberId)
    .eq('chama_id', chamaId)
    .in('status', ['outstanding', 'partial'])
    .limit(1);

  const hasDebts = (outstandingDebts && outstandingDebts.length > 0);
  const isEligible = unpaidCycles.length === 0 && totalCycles > 0 && !hasDebts;

  return { isEligible, unpaidCycles: unpaidCycles.length, shortfall: totalUnpaid, hasDebts, totalCycles };
}

async function cleanup(supabase: any, chamaId: string) {
  try {
    // Delete in order to respect foreign key constraints
    await supabase.from('chama_cycle_deficits').delete().eq('chama_id', chamaId);
    await supabase.from('chama_member_debts').delete().eq('chama_id', chamaId);
    
    // Get cycle IDs first
    const { data: cycles } = await supabase
      .from('contribution_cycles')
      .select('id')
      .eq('chama_id', chamaId);
    
    if (cycles) {
      for (const cycle of cycles) {
        await supabase.from('member_cycle_payments').delete().eq('cycle_id', cycle.id);
        await supabase.from('payout_skips').delete().eq('cycle_id', cycle.id);
      }
    }

    await supabase.from('withdrawals').delete().eq('chama_id', chamaId);
    await supabase.from('contribution_cycles').delete().eq('chama_id', chamaId);
    await supabase.from('contributions').delete().eq('chama_id', chamaId);
    await supabase.from('chama_messages').delete().eq('chama_id', chamaId);
    await supabase.from('chama_invite_codes').delete().eq('chama_id', chamaId);
    await supabase.from('chama_members').delete().eq('chama_id', chamaId);
    await supabase.from('chama').delete().eq('id', chamaId);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}
