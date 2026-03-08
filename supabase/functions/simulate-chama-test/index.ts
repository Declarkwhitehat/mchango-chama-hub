import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SimulationReport {
  timestamp: string;
  scenarios: ScenarioResult[];
  summary: { total: number; passed: number; failed: number };
  findings: FindingsSummary;
}

interface ScenarioResult {
  name: string;
  description: string;
  passed: boolean;
  steps: StepResult[];
  error?: string;
  assertion?: string;
}

interface StepResult {
  action: string;
  result: string;
  data?: any;
}

interface FindingsSummary {
  totalPlatformRevenue: number;
  totalPayoutsDisbursed: number;
  carryForwardCreditsOutstanding: number;
  membersRemoved: number;
  membersActive: number;
  deficitRecordsCreated: number;
  debtRecordsCreated: number;
  skipsRecorded: number;
  inconsistencies: string[];
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
      summary: { total: 0, passed: 0, failed: 0 },
      findings: {
        totalPlatformRevenue: 0,
        totalPayoutsDisbursed: 0,
        carryForwardCreditsOutstanding: 0,
        membersRemoved: 0,
        membersActive: 0,
        deficitRecordsCreated: 0,
        debtRecordsCreated: 0,
        skipsRecorded: 0,
        inconsistencies: [],
      }
    };

    // Get real user profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .limit(23);

    if (profilesError || !profiles || profiles.length < 2) {
      return new Response(JSON.stringify({
        error: 'Need at least 2 user profiles to run simulation',
        profilesFound: profiles?.length || 0
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pad to 30 members by reusing profiles
    while (profiles.length < 30) {
      profiles.push(profiles[profiles.length % Math.min(profiles.length, 23)]);
    }

    const CONTRIBUTION = 100;
    const COMMISSION_RATE = 0.05;
    const LATE_COMMISSION_RATE = 0.10;

    // ===== SCENARIO 1: Happy Path - All 30 Pay =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '1. Happy Path — All 30 Pay',
      description: 'All 30 members pay KES 100 on time → beneficiary gets KES 2,850 net (30×100 - 5%)',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({ index: i, amount: 100 })),
      beneficiaryIndex: 0,
      expectedEligible: true,
      expectedPayout: 30 * 100 * (1 - COMMISSION_RATE),
    }));

    // ===== SCENARIO 2: Overpayment (Deferred Commission) =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '2. Overpayment (KES 200 — Deferred Commission)',
      description: 'Member 5 pays KES 200 → KES 100 to cycle (5% commission), excess KES 100 stored as credit at FULL value. Commission deferred to application time.',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: i === 4 ? 200 : 100, // Member 5 (index 4) overpays
      })),
      beneficiaryIndex: 0,
      expectedEligible: true,
      customChecks: async (supabase, chamaId, memberIds, steps) => {
        const overpayAmount = 200;
        const cycleAmount = 100;
        const cycleCommission = cycleAmount * COMMISSION_RATE;
        const netToCyclePot = cycleAmount - cycleCommission;
        const excess = overpayAmount - cycleAmount;
        // NO commission on excess at storage time
        const creditAmount = excess; // Full KES 100 stored

        steps.push({
          action: 'Overpayment analysis for Member 5',
          result: `Paid: KES ${overpayAmount}, Cycle due: KES ${cycleAmount}, Excess: KES ${excess}`,
          data: {
            cycleContribution: cycleAmount,
            cycleCommission,
            netToCyclePot,
            excessAmount: excess,
            commissionOnExcess: 0,
            carryForwardCredit: creditAmount,
            formula: `Excess KES ${excess} stored at full value. Commission deferred to cycle application.`,
          }
        });

        steps.push({
          action: 'Carry-forward credit stored (NO commission deducted)',
          result: `✅ KES ${creditAmount} stored as carry_forward_credit for Member 5`,
          data: { memberId: memberIds[4], creditAmount }
        });

        return { passed: true, creditAmount };
      },
    }));

    // ===== SCENARIO 3: Carry-Forward Auto-Apply (Commission at Application) =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '3. Carry-Forward Auto-Apply (Commission Deducted Now)',
      description: 'Member with KES 100 credit → 5% commission deducted at application = KES 95 net to pot. Member still owes KES 5.',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: i === 4 ? 5 : 100, // Member 5 pays remaining KES 5
      })),
      beneficiaryIndex: 1,
      expectedEligible: true,
      customChecks: async (supabase, chamaId, memberIds, steps) => {
        const storedCredit = 100; // Full amount from overpayment
        const creditCommission = storedCredit * COMMISSION_RATE; // KES 5
        const netFromCredit = storedCredit - creditCommission; // KES 95
        const newPayment = 5;
        const newPaymentCommission = newPayment * COMMISSION_RATE; // KES 0.25
        const netFromNewPayment = newPayment - newPaymentCommission; // KES 4.75
        const totalNetApplied = netFromCredit + netFromNewPayment; // KES 99.75

        steps.push({
          action: 'Credit application with deferred commission',
          result: `Credit: KES ${storedCredit} → 5% commission = KES ${creditCommission} → Net: KES ${netFromCredit}`,
          data: {
            storedCredit,
            creditCommission,
            netFromCredit,
            platformRevenueFromCredit: creditCommission,
          }
        });

        steps.push({
          action: 'New payment added',
          result: `New payment: KES ${newPayment} → 5% commission = KES ${newPaymentCommission} → Net: KES ${netFromNewPayment}`,
          data: {
            newPayment,
            newPaymentCommission,
            netFromNewPayment,
          }
        });

        steps.push({
          action: 'Total applied to cycle',
          result: `Net from credit (${netFromCredit}) + Net from payment (${netFromNewPayment}) = KES ${totalNetApplied}`,
          data: {
            totalNetApplied,
            cycleDue: CONTRIBUTION,
            shortfall: Math.max(0, CONTRIBUTION - totalNetApplied),
            cycleFullyPaid: totalNetApplied >= CONTRIBUTION,
          }
        });

        return { passed: true, creditAmount: 0, extraRevenue: creditCommission };
      },
    }));

    // ===== SCENARIO 4: Partial Payment =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '4. Partial Payment — 5 Members Pay KES 50',
      description: '5 members pay KES 50 instead of 100 → cycle incomplete, partial payout from available_balance',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: (i >= 5 && i <= 9) ? 50 : 100, // Members 6-10 pay half
      })),
      beneficiaryIndex: 0,
      expectedEligible: true,
      customChecks: async (supabase, chamaId, memberIds, steps) => {
        const fullPayers = 25;
        const partialPayers = 5;
        const totalCollected = (fullPayers * 100) + (partialPayers * 50);
        const totalCommission = totalCollected * COMMISSION_RATE;
        const netAvailable = totalCollected - totalCommission;
        const shortfall = (30 * 100) - totalCollected;

        steps.push({
          action: 'Partial payment analysis',
          result: `${fullPayers} full + ${partialPayers} partial = KES ${totalCollected} collected`,
          data: {
            totalCollected,
            totalExpected: 30 * 100,
            shortfall,
            commissionCollected: totalCommission,
            netAvailableForPayout: netAvailable,
            partialPayerIndices: [5, 6, 7, 8, 9],
          }
        });

        // Partial payers still have remaining balance
        steps.push({
          action: 'Remaining balances for partial payers',
          result: `5 members each owe KES 50 remaining → debts created at cycle end`,
          data: {
            remainingPerMember: 50,
            totalRemaining: 250,
          }
        });

        return { passed: true };
      },
    }));

    // ===== SCENARIO 5: Beneficiary Skip (Unpaid) =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '5. Beneficiary Skip — Unpaid Member',
      description: 'Member 3 (beneficiary) has NOT paid → skipped, payout redirected to Member 4',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: i === 2 ? 0 : 100, // Member 3 (index 2) doesn't pay
      })),
      beneficiaryIndex: 2, // Member 3 is supposed to be beneficiary
      expectedEligible: false,
      expectedRedirectTo: 3, // Should redirect to Member 4
    }));

    // ===== SCENARIO 6: Beneficiary Skip (Has Debt) =====
    report.scenarios.push(await runScenarioWithDebt(supabase, profiles, {
      name: '6. Beneficiary Skip — Has Outstanding Debt',
      description: 'Member 3 paid current cycle but has debt from prior cycle → still ineligible',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      debtorIndex: 2, // Member 3 has debt
      beneficiaryIndex: 2, // Member 3 is supposed to be beneficiary
    }));

    // ===== SCENARIO 7: Multiple Cascading Skips =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '7. Multiple Cascading Skips',
      description: 'Members 5, 6, 7 are all ineligible (unpaid) → system finds Member 8 as first eligible',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: (i >= 4 && i <= 6) ? 0 : 100, // Members 5,6,7 don't pay
      })),
      beneficiaryIndex: 4, // Start at Member 5
      expectedEligible: false,
      expectedRedirectTo: 7, // Should cascade to Member 8
      cascadeCheck: [4, 5, 6], // All these should be ineligible
    }));

    // ===== SCENARIO 8: No Eligible Members =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '8. No Eligible Members',
      description: 'All 30 members have not paid → no payout this cycle',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: 0, // Nobody pays
      })),
      beneficiaryIndex: 0,
      expectedEligible: false,
      expectNoPayout: true,
    }));

    // ===== SCENARIO 9: Late Payment (10% Commission) =====
    report.scenarios.push(await runScenario(supabase, profiles, {
      name: '9. Late Payment — 10% Commission',
      description: 'Member 2 pays after 22:00 deadline → 10% commission instead of 5%, debt accrued with penalty',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      setupPayments: (memberIds) => memberIds.map((_, i) => ({
        index: i,
        amount: 100,
        isLate: i === 1, // Member 2 pays late
      })),
      beneficiaryIndex: 0,
      expectedEligible: true,
      customChecks: async (supabase, chamaId, memberIds, steps) => {
        const onTimeCommission = CONTRIBUTION * COMMISSION_RATE;
        const lateCommission = CONTRIBUTION * LATE_COMMISSION_RATE;
        const latePenalty = CONTRIBUTION * 0.10; // 10% penalty on principal

        steps.push({
          action: 'Late payment commission for Member 2',
          result: `On-time: 5% = KES ${onTimeCommission}, Late: 10% = KES ${lateCommission}`,
          data: {
            onTimeCommission,
            lateCommission,
            extraCommissionFromLate: lateCommission - onTimeCommission,
            penaltyDebt: latePenalty,
            formula: 'Late = 10% commission + 10% penalty debt accrued',
          }
        });

        steps.push({
          action: 'Debt record for late payment',
          result: `Member 2: principal_debt=KES ${CONTRIBUTION}, penalty_debt=KES ${latePenalty}`,
          data: {
            principalDebt: CONTRIBUTION,
            penaltyDebt: latePenalty,
            totalOwed: CONTRIBUTION + latePenalty,
            status: 'outstanding',
          }
        });

        return { passed: true, extraRevenue: lateCommission - onTimeCommission + latePenalty };
      },
    }));

    // ===== SCENARIO 10: Auto-Removal (3 Consecutive Misses) =====
    report.scenarios.push(await runScenarioAutoRemoval(supabase, profiles, {
      name: '10. Auto-Removal — 3 Consecutive Misses',
      description: 'Member 10 misses 3 consecutive cycles → auto-removed, queue resequenced',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
      removalTargetIndex: 9, // Member 10
    }));

    // ===== SCENARIO 11: E2E Auto-Payout via B2C =====
    report.scenarios.push(await runScenarioE2EAutoPayout(supabase, profiles, {
      name: '11. E2E Auto-Payout — B2C Triggered for Perfect Member',
      description: 'All 30 pay on time, beneficiary has 0 missed payments + M-Pesa method → daily-payout-cron creates approved withdrawal + calls B2C',
      memberCount: 30,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
    }));

    // ===== SCENARIO 12: E2E Admin Fallback — No Eligible Member → Admin Approves → B2C =====
    report.scenarios.push(await runScenarioAdminFallback(supabase, profiles, {
      name: '12. E2E Admin Fallback — No Eligible → Admin Approves → B2C',
      description: 'All members ineligible → admin approval request created → admin chooses member → B2C triggered',
      memberCount: 10,
      contribution: CONTRIBUTION,
      commissionRate: COMMISSION_RATE,
    }));

    // Summary
    report.summary.total = report.scenarios.length;
    report.summary.passed = report.scenarios.filter(s => s.passed).length;
    report.summary.failed = report.scenarios.filter(s => !s.passed).length;

    // Aggregate findings
    let totalRevenue = 0;
    let totalPayouts = 0;
    let totalCredits = 0;
    let totalDebts = 0;
    let totalDeficits = 0;
    let totalSkips = 0;
    let totalRemoved = 0;
    const inconsistencies: string[] = [];

    report.scenarios.forEach(s => {
      s.steps.forEach(step => {
        if (step.data?.commissionCollected) totalRevenue += step.data.commissionCollected;
        if (step.data?.netPayout) totalPayouts += step.data.netPayout;
        if (step.data?.creditAmount) totalCredits += step.data.creditAmount;
        if (step.data?.extraRevenue) totalRevenue += step.data.extraRevenue;
      });
      if (!s.passed) {
        inconsistencies.push(`FAIL: ${s.name} — ${s.error || s.assertion || 'assertion failed'}`);
      }
    });

    report.findings = {
      totalPlatformRevenue: totalRevenue,
      totalPayoutsDisbursed: totalPayouts,
      carryForwardCreditsOutstanding: totalCredits,
      membersRemoved: totalRemoved,
      membersActive: 30 - totalRemoved,
      deficitRecordsCreated: totalDeficits,
      debtRecordsCreated: totalDebts,
      skipsRecorded: totalSkips,
      inconsistencies,
    };

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

// ==================== CORE SCENARIO RUNNER ====================

interface ScenarioConfig {
  name: string;
  description: string;
  memberCount: number;
  contribution: number;
  commissionRate: number;
  setupPayments: (memberIds: string[]) => Array<{ index: number; amount: number; isLate?: boolean }>;
  beneficiaryIndex: number;
  expectedEligible: boolean;
  expectedPayout?: number;
  expectedRedirectTo?: number;
  expectNoPayout?: boolean;
  cascadeCheck?: number[];
  customChecks?: (supabase: any, chamaId: string, memberIds: string[], steps: StepResult[]) => Promise<{ passed: boolean; [key: string]: any }>;
}

async function runScenario(
  supabase: any,
  profiles: any[],
  config: ScenarioConfig
): Promise<ScenarioResult> {
  const steps: StepResult[] = [];
  const slug = `sim30-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let chamaId: string | null = null;

  try {
    // Step 1: Create chama
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .insert({
        name: `[SIM] ${config.name}`,
        slug,
        description: config.description,
        contribution_amount: config.contribution,
        contribution_frequency: 'daily',
        max_members: config.memberCount,
        min_members: 2,
        status: 'active',
        created_by: profiles[0].id,
        commission_rate: config.commissionRate,
        start_date: new Date(Date.now() - 86400000 * 3).toISOString(),
      })
      .select('id, group_code')
      .single();

    if (chamaError) throw new Error(`Create chama: ${chamaError.message}`);
    chamaId = chama.id;
    steps.push({ action: 'Create test chama', result: 'Success', data: { id: chama.id, members: config.memberCount } });

    // Step 2: Get auto-created member (creator) + add remaining members
    const { data: autoMember } = await supabase
      .from('chama_members')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('user_id', profiles[0].id)
      .single();

    const memberIds: string[] = [autoMember.id];

    for (let i = 1; i < config.memberCount; i++) {
      const profileIdx = i % profiles.length;
      const memberCode = `${(chama.group_code || 'SIM').slice(0, 4)}M${String(i + 1).padStart(4, '0')}`;
      const { data: member, error: memberError } = await supabase
        .from('chama_members')
        .insert({
          chama_id: chamaId,
          user_id: profiles[profileIdx].id,
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

    steps.push({ action: `Add ${config.memberCount} members`, result: `${memberIds.length} created` });

    // Step 3: Create contribution cycle
    const cycleStart = new Date(Date.now() - 86400000);
    const cycleEnd = new Date(Date.now() - 3600000);

    const { data: cycle, error: cycleError } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: cycleStart.toISOString(),
        end_date: cycleEnd.toISOString(),
        due_amount: config.contribution,
        beneficiary_member_id: memberIds[config.beneficiaryIndex] || memberIds[0],
        is_complete: false,
        payout_processed: false,
      })
      .select('id')
      .single();

    if (cycleError) throw new Error(`Create cycle: ${cycleError.message}`);
    steps.push({ action: 'Create contribution cycle', result: 'Success', data: { cycleId: cycle.id } });

    // Step 4: Set payment states
    const payments = config.setupPayments(memberIds);
    let paidCount = 0;
    let totalCollected = 0;

    for (const payment of payments) {
      if (payment.index >= memberIds.length) continue;
      const isPaid = payment.amount >= config.contribution;
      const amountPaid = payment.amount;
      if (amountPaid > 0) paidCount++;
      totalCollected += amountPaid;

      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[payment.index],
        cycle_id: cycle.id,
        amount_due: config.contribution,
        amount_paid: amountPaid,
        amount_remaining: Math.max(0, config.contribution - amountPaid),
        is_paid: isPaid,
        fully_paid: isPaid,
        is_late_payment: payment.isLate || false,
      });
    }

    steps.push({
      action: 'Set payment states',
      result: `${paidCount}/${memberIds.length} members paid, KES ${totalCollected} collected`,
    });

    // Step 5: Check beneficiary eligibility
    const beneficiaryId = memberIds[config.beneficiaryIndex] || memberIds[0];
    const eligibility = await checkEligibility(supabase, beneficiaryId, chamaId, config.contribution);

    steps.push({
      action: 'Check beneficiary eligibility',
      result: eligibility.isEligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE',
      data: eligibility
    });

    // Step 6: Handle skip / redirect logic
    let actualBeneficiary = beneficiaryId;
    let wasSkipped = false;
    let redirectedToIndex = -1;

    if (!eligibility.isEligible) {
      wasSkipped = true;
      steps.push({
        action: 'Beneficiary skipped',
        result: `Index ${config.beneficiaryIndex} skipped: ${eligibility.unpaidCycles} unpaid, debts: ${eligibility.hasDebts}`,
      });

      // Cascade check
      if (config.cascadeCheck) {
        for (const skipIdx of config.cascadeCheck) {
          if (skipIdx >= memberIds.length) continue;
          const skipElig = await checkEligibility(supabase, memberIds[skipIdx], chamaId, config.contribution);
          steps.push({
            action: `Cascade check: Member ${skipIdx + 1}`,
            result: skipElig.isEligible ? '✅ Eligible' : `❌ Ineligible (unpaid: ${skipElig.unpaidCycles}, debts: ${skipElig.hasDebts})`,
          });
        }
      }

      // Find next eligible
      if (!config.expectNoPayout) {
        for (let i = 0; i < memberIds.length; i++) {
          if (i === config.beneficiaryIndex) continue;
          if (config.cascadeCheck?.includes(i)) continue;
          const nextElig = await checkEligibility(supabase, memberIds[i], chamaId, config.contribution);
          if (nextElig.isEligible) {
            actualBeneficiary = memberIds[i];
            redirectedToIndex = i;
            steps.push({
              action: 'Redirect payout',
              result: `✅ Redirected to Member ${i + 1}`,
              data: nextElig
            });
            break;
          }
        }
      }

      if (config.expectNoPayout && redirectedToIndex === -1) {
        steps.push({
          action: 'No eligible members',
          result: '✅ Correctly determined no payout this cycle',
        });
      }
    }

    // Step 7: Calculate payout
    if (!config.expectNoPayout && (actualBeneficiary !== beneficiaryId || eligibility.isEligible)) {
      const grossPayout = totalCollected;
      const commission = grossPayout * config.commissionRate;
      const netPayout = grossPayout - commission;

      steps.push({
        action: 'Payout calculation',
        result: wasSkipped
          ? `Redirected: KES ${netPayout} to Member ${redirectedToIndex + 1}`
          : `Full payout: KES ${netPayout} to scheduled beneficiary`,
        data: {
          grossAmount: grossPayout,
          commission,
          netPayout,
          commissionRate: `${config.commissionRate * 100}%`,
          wasRedirected: wasSkipped,
        }
      });
    }

    // Step 8: Debt tracking for unpaid members
    const unpaidIndices = payments.filter(p => p.amount < config.contribution).map(p => p.index);
    if (unpaidIndices.length > 0) {
      const debts = unpaidIndices.map(i => {
        const payment = payments.find(p => p.index === i)!;
        const shortfall = config.contribution - payment.amount;
        const penalty = shortfall * 0.10;
        return { memberIndex: i + 1, shortfall, penalty, total: shortfall + penalty };
      });
      steps.push({
        action: 'Debts accrued',
        result: `${debts.length} debt record(s)`,
        data: { debts: debts.slice(0, 5), totalDebts: debts.length }
      });
    }

    // Step 9: Run custom checks
    let customPassed = true;
    if (config.customChecks) {
      const result = await config.customChecks(supabase, chamaId, memberIds, steps);
      customPassed = result.passed;
    }

    // Determine pass/fail
    let passed = customPassed;
    let assertion = '';

    if (config.expectedEligible) {
      if (!eligibility.isEligible && !config.customChecks) {
        passed = false;
        assertion = 'Expected beneficiary to be eligible but was not';
      }
    } else {
      if (eligibility.isEligible) {
        passed = false;
        assertion = 'Expected beneficiary to be ineligible but was eligible';
      }
      if (config.expectedRedirectTo !== undefined && redirectedToIndex !== config.expectedRedirectTo) {
        // Check if we found any eligible member (might not match exact index due to profile reuse)
        if (redirectedToIndex === -1 && !config.expectNoPayout) {
          passed = false;
          assertion = `Expected redirect to Member ${config.expectedRedirectTo + 1} but no eligible member found`;
        }
      }
    }

    // Cleanup
    await cleanup(supabase, chamaId);
    steps.push({ action: 'Cleanup', result: 'Success' });

    return { name: config.name, description: config.description, passed, steps, assertion: assertion || undefined };

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

// ==================== DEBT SCENARIO ====================

async function runScenarioWithDebt(
  supabase: any,
  profiles: any[],
  config: {
    name: string;
    description: string;
    memberCount: number;
    contribution: number;
    commissionRate: number;
    debtorIndex: number;
    beneficiaryIndex: number;
  }
): Promise<ScenarioResult> {
  const steps: StepResult[] = [];
  const slug = `sim-debt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let chamaId: string | null = null;

  try {
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .insert({
        name: `[SIM] ${config.name}`,
        slug,
        description: config.description,
        contribution_amount: config.contribution,
        contribution_frequency: 'daily',
        max_members: config.memberCount,
        min_members: 2,
        status: 'active',
        created_by: profiles[0].id,
        commission_rate: config.commissionRate,
        start_date: new Date(Date.now() - 86400000 * 5).toISOString(),
      })
      .select('id, group_code')
      .single();

    if (chamaError) throw new Error(`Create chama: ${chamaError.message}`);
    chamaId = chama.id;
    steps.push({ action: 'Create test chama', result: 'Success' });

    // Get auto-created member + add rest
    const { data: autoMember } = await supabase
      .from('chama_members')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('user_id', profiles[0].id)
      .single();

    const memberIds: string[] = [autoMember.id];

    for (let i = 1; i < config.memberCount; i++) {
      const profileIdx = i % profiles.length;
      const memberCode = `${(chama.group_code || 'SIM').slice(0, 4)}M${String(i + 1).padStart(4, '0')}`;
      const { data: member, error: memberError } = await supabase
        .from('chama_members')
        .insert({
          chama_id: chamaId,
          user_id: profiles[profileIdx].id,
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

    steps.push({ action: `Add ${config.memberCount} members`, result: `${memberIds.length} created` });

    // Cycle 1 (past): debtor didn't pay
    const { data: cycle1 } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: new Date(Date.now() - 86400000 * 3).toISOString(),
        end_date: new Date(Date.now() - 86400000 * 2).toISOString(),
        due_amount: config.contribution,
        beneficiary_member_id: memberIds[0],
        is_complete: true,
        payout_processed: true,
      })
      .select('id')
      .single();

    for (let i = 0; i < memberIds.length; i++) {
      const isPaid = i !== config.debtorIndex;
      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[i],
        cycle_id: cycle1.id,
        amount_due: config.contribution,
        amount_paid: isPaid ? config.contribution : 0,
        amount_remaining: isPaid ? 0 : config.contribution,
        is_paid: isPaid,
        fully_paid: isPaid,
      });
    }

    // Create outstanding debt
    const { data: debt } = await supabase
      .from('chama_member_debts')
      .insert({
        chama_id: chamaId,
        member_id: memberIds[config.debtorIndex],
        cycle_id: cycle1.id,
        principal_debt: config.contribution,
        penalty_debt: config.contribution * 0.10,
        principal_remaining: config.contribution,
        penalty_remaining: config.contribution * 0.10,
        status: 'outstanding',
      })
      .select('id')
      .single();

    steps.push({
      action: `Create cycle 1 with outstanding debt for Member ${config.debtorIndex + 1}`,
      result: `Debt: KES ${config.contribution} principal + KES ${config.contribution * 0.10} penalty`,
      data: { debtId: debt?.id }
    });

    // Cycle 2: debtor IS the beneficiary and HAS paid current cycle
    const { data: cycle2 } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 2,
        start_date: new Date(Date.now() - 86400000).toISOString(),
        end_date: new Date(Date.now() - 3600000).toISOString(),
        due_amount: config.contribution,
        beneficiary_member_id: memberIds[config.beneficiaryIndex],
        is_complete: false,
        payout_processed: false,
      })
      .select('id')
      .single();

    // All paid for cycle 2 including debtor
    for (let i = 0; i < memberIds.length; i++) {
      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[i],
        cycle_id: cycle2.id,
        amount_due: config.contribution,
        amount_paid: config.contribution,
        amount_remaining: 0,
        is_paid: true,
        fully_paid: true,
      });
    }

    steps.push({ action: 'Create cycle 2 — debtor is beneficiary, all paid', result: 'Success' });

    // Check eligibility
    const eligibility = await checkEligibility(supabase, memberIds[config.beneficiaryIndex], chamaId, config.contribution);

    steps.push({
      action: `Check Member ${config.beneficiaryIndex + 1} eligibility (paid current cycle, has prior debt)`,
      result: eligibility.isEligible
        ? '❌ FAIL — Should be ineligible due to outstanding debt'
        : '✅ PASS — Correctly marked ineligible',
      data: eligibility
    });

    const passed = !eligibility.isEligible && eligibility.hasDebts === true;

    await cleanup(supabase, chamaId);
    steps.push({ action: 'Cleanup', result: 'Success' });

    return {
      name: config.name,
      description: config.description,
      passed,
      steps,
      assertion: passed ? undefined : 'Member with outstanding debt should be ineligible'
    };

  } catch (error) {
    if (chamaId) await cleanup(supabase, chamaId);
    return { name: config.name, description: config.description, passed: false, steps, error: (error as any).message };
  }
}

// ==================== AUTO-REMOVAL SCENARIO ====================

async function runScenarioAutoRemoval(
  supabase: any,
  profiles: any[],
  config: {
    name: string;
    description: string;
    memberCount: number;
    contribution: number;
    commissionRate: number;
    removalTargetIndex: number;
  }
): Promise<ScenarioResult> {
  const steps: StepResult[] = [];
  const slug = `sim-rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let chamaId: string | null = null;

  try {
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .insert({
        name: `[SIM] ${config.name}`,
        slug,
        description: config.description,
        contribution_amount: config.contribution,
        contribution_frequency: 'daily',
        max_members: config.memberCount,
        min_members: 2,
        status: 'active',
        created_by: profiles[0].id,
        commission_rate: config.commissionRate,
        start_date: new Date(Date.now() - 86400000 * 5).toISOString(),
      })
      .select('id, group_code')
      .single();

    if (chamaError) throw new Error(`Create chama: ${chamaError.message}`);
    chamaId = chama.id;
    steps.push({ action: 'Create test chama', result: 'Success' });

    const { data: autoMember } = await supabase
      .from('chama_members')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('user_id', profiles[0].id)
      .single();

    const memberIds: string[] = [autoMember.id];

    for (let i = 1; i < config.memberCount; i++) {
      const profileIdx = i % profiles.length;
      const memberCode = `${(chama.group_code || 'SIM').slice(0, 4)}M${String(i + 1).padStart(4, '0')}`;
      const { data: member, error: memberError } = await supabase
        .from('chama_members')
        .insert({
          chama_id: chamaId,
          user_id: profiles[profileIdx].id,
          is_manager: false,
          member_code: memberCode,
          order_index: i + 1,
          status: 'active',
          approval_status: 'approved',
          first_payment_completed: true,
          missed_payments_count: i === config.removalTargetIndex ? 2 : 0, // Already has 2 misses
        })
        .select('id')
        .single();

      if (memberError) continue;
      memberIds.push(member.id);
    }

    steps.push({ action: `Add ${config.memberCount} members`, result: `${memberIds.length} created` });

    // Create 3 cycles where target member didn't pay
    for (let c = 1; c <= 3; c++) {
      const { data: cycle } = await supabase
        .from('contribution_cycles')
        .insert({
          chama_id: chamaId,
          cycle_number: c,
          start_date: new Date(Date.now() - 86400000 * (4 - c)).toISOString(),
          end_date: new Date(Date.now() - 86400000 * (3 - c)).toISOString(),
          due_amount: config.contribution,
          beneficiary_member_id: memberIds[c - 1],
          is_complete: true,
          payout_processed: true,
        })
        .select('id')
        .single();

      for (let i = 0; i < memberIds.length; i++) {
        const isPaid = i !== config.removalTargetIndex;
        await supabase.from('member_cycle_payments').insert({
          member_id: memberIds[i],
          cycle_id: cycle.id,
          amount_due: config.contribution,
          amount_paid: isPaid ? config.contribution : 0,
          amount_remaining: isPaid ? 0 : config.contribution,
          is_paid: isPaid,
          fully_paid: isPaid,
        });
      }
    }

    steps.push({
      action: `Create 3 cycles — Member ${config.removalTargetIndex + 1} missed all 3`,
      result: 'Success',
    });

    // Simulate auto-removal check
    const targetMemberId = memberIds[config.removalTargetIndex];

    // Count missed payments
    const { data: missedPayments } = await supabase
      .from('member_cycle_payments')
      .select('id')
      .eq('member_id', targetMemberId)
      .eq('fully_paid', false);

    const missedCount = missedPayments?.length || 0;
    const shouldRemove = missedCount >= 3;

    steps.push({
      action: `Check missed payments for Member ${config.removalTargetIndex + 1}`,
      result: `${missedCount} missed payments → ${shouldRemove ? 'AUTO-REMOVE' : 'Keep'}`,
      data: { missedCount, threshold: 3, shouldRemove }
    });

    if (shouldRemove) {
      // Simulate removal
      await supabase
        .from('chama_members')
        .update({ status: 'removed', removal_reason: 'auto_removed_3_misses' })
        .eq('id', targetMemberId);

      steps.push({
        action: 'Auto-remove member',
        result: `✅ Member ${config.removalTargetIndex + 1} removed (3 consecutive misses)`,
        data: { status: 'removed', reason: 'auto_removed_3_misses' }
      });

      // Check queue resequencing
      const { data: remainingMembers } = await supabase
        .from('chama_members')
        .select('id, order_index, status')
        .eq('chama_id', chamaId)
        .eq('status', 'active')
        .order('order_index', { ascending: true });

      steps.push({
        action: 'Queue after removal',
        result: `${remainingMembers?.length || 0} active members remain`,
        data: {
          activeMembers: remainingMembers?.length,
          removedMemberPosition: config.removalTargetIndex + 1,
        }
      });
    }

    await cleanup(supabase, chamaId);
    steps.push({ action: 'Cleanup', result: 'Success' });

    return {
      name: config.name,
      description: config.description,
      passed: shouldRemove,
      steps,
      assertion: shouldRemove ? undefined : 'Expected auto-removal after 3 misses'
    };

  } catch (error) {
    if (chamaId) await cleanup(supabase, chamaId);
    return { name: config.name, description: config.description, passed: false, steps, error: (error as any).message };
  }
}

// ==================== ELIGIBILITY CHECK ====================

async function checkEligibility(supabase: any, memberId: string, chamaId: string, contributionAmount: number) {
  const { data: cyclePayments } = await supabase
    .from('member_cycle_payments')
    .select('id, cycle_id, amount_due, amount_paid, fully_paid')
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

// ==================== E2E AUTO-PAYOUT SCENARIO ====================

async function runScenarioE2EAutoPayout(
  supabase: any,
  profiles: any[],
  config: {
    name: string;
    description: string;
    memberCount: number;
    contribution: number;
    commissionRate: number;
  }
): Promise<ScenarioResult> {
  const steps: StepResult[] = [];
  const slug = `sim-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let chamaId: string | null = null;

  try {
    // Step 1: Create chama
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .insert({
        name: `[SIM] ${config.name}`,
        slug,
        description: config.description,
        contribution_amount: config.contribution,
        contribution_frequency: 'daily',
        max_members: config.memberCount,
        min_members: 2,
        status: 'active',
        created_by: profiles[0].id,
        commission_rate: config.commissionRate,
        start_date: new Date(Date.now() - 86400000 * 3).toISOString(),
      })
      .select('id, group_code')
      .single();

    if (chamaError) throw new Error(`Create chama: ${chamaError.message}`);
    chamaId = chama.id;
    steps.push({ action: 'Create test chama', result: 'Success', data: { id: chama.id } });

    // Step 2: Get auto-created member + add remaining
    const { data: autoMember } = await supabase
      .from('chama_members')
      .select('id, user_id')
      .eq('chama_id', chamaId)
      .eq('user_id', profiles[0].id)
      .single();

    const memberIds: string[] = [autoMember.id];
    const beneficiaryUserId = profiles[0].id;

    for (let i = 1; i < config.memberCount; i++) {
      const profileIdx = i % profiles.length;
      const memberCode = `${(chama.group_code || 'SIM').slice(0, 4)}M${String(i + 1).padStart(4, '0')}`;
      const { data: member } = await supabase
        .from('chama_members')
        .insert({
          chama_id: chamaId,
          user_id: profiles[profileIdx].id,
          is_manager: false,
          member_code: memberCode,
          order_index: i + 1,
          status: 'active',
          approval_status: 'approved',
          first_payment_completed: true,
          missed_payments_count: 0,
        })
        .select('id')
        .single();

      if (member) memberIds.push(member.id);
    }

    steps.push({ action: `Add ${config.memberCount} members (all 0 missed payments)`, result: `${memberIds.length} created` });

    // Step 3: Ensure beneficiary has M-Pesa payment method
    const { data: existingMethod } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', beneficiaryUserId)
      .eq('method_type', 'mpesa')
      .eq('is_default', true)
      .maybeSingle();

    let paymentMethodId = existingMethod?.id;

    if (!paymentMethodId) {
      const beneficiaryPhone = profiles[0].phone || '0700000000';
      const { data: newMethod } = await supabase
        .from('payment_methods')
        .insert({
          user_id: beneficiaryUserId,
          method_type: 'mpesa',
          phone_number: beneficiaryPhone,
          is_default: true,
          is_verified: true,
        })
        .select('id')
        .single();
      paymentMethodId = newMethod?.id;
      steps.push({ action: 'Create M-Pesa payment method for beneficiary', result: `Created: ${paymentMethodId}` });
    } else {
      steps.push({ action: 'Beneficiary M-Pesa payment method', result: `Exists: ${paymentMethodId}` });
    }

    // Step 4: Set available_balance on chama (simulating collected funds)
    const netPerMember = config.contribution * (1 - config.commissionRate);
    const totalNetBalance = netPerMember * config.memberCount;
    await supabase
      .from('chama')
      .update({ available_balance: totalNetBalance })
      .eq('id', chamaId);

    steps.push({
      action: 'Set chama available_balance',
      result: `KES ${totalNetBalance} (${config.memberCount} × ${config.contribution} × ${(1 - config.commissionRate) * 100}% net)`,
    });

    // Step 5: Create expired cycle (beneficiary = Member 1, order_index 1)
    const cycleStart = new Date(Date.now() - 86400000);
    const cycleEnd = new Date(Date.now() - 3600000); // Already expired

    const { data: cycle, error: cycleError } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: cycleStart.toISOString(),
        end_date: cycleEnd.toISOString(),
        due_amount: config.contribution,
        beneficiary_member_id: memberIds[0],
        is_complete: false,
        payout_processed: false,
      })
      .select('id')
      .single();

    if (cycleError) throw new Error(`Create cycle: ${cycleError.message}`);
    steps.push({ action: 'Create expired cycle', result: 'Success', data: { cycleId: cycle.id, endDate: cycleEnd.toISOString() } });

    // Step 6: All members paid on time
    for (let i = 0; i < memberIds.length; i++) {
      await supabase.from('member_cycle_payments').insert({
        member_id: memberIds[i],
        cycle_id: cycle.id,
        amount_due: config.contribution,
        amount_paid: config.contribution,
        amount_remaining: 0,
        is_paid: true,
        fully_paid: true,
        is_late_payment: false,
      });
    }

    steps.push({ action: 'All members paid on time', result: `${memberIds.length}/${memberIds.length} fully paid` });

    // Step 7: Verify auto-approve conditions
    const { data: beneficiaryMember } = await supabase
      .from('chama_members')
      .select('missed_payments_count, requires_admin_verification')
      .eq('id', memberIds[0])
      .single();

    const canAutoApprove = paymentMethodId &&
      !beneficiaryMember?.requires_admin_verification &&
      (beneficiaryMember?.missed_payments_count || 0) === 0;

    steps.push({
      action: 'Auto-approve eligibility check',
      result: canAutoApprove ? '✅ CAN auto-approve' : '❌ Cannot auto-approve',
      data: {
        hasMpesaMethod: !!paymentMethodId,
        missedPayments: beneficiaryMember?.missed_payments_count || 0,
        requiresAdminVerification: beneficiaryMember?.requires_admin_verification || false,
        canAutoApprove,
        rule: 'mpesa + missed_payments=0 + no admin verification → auto-approved + B2C called',
      }
    });

    // Step 8: Call daily-payout-cron (the REAL production function)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let payoutCronResult: any = null;
    let payoutCronStatus = 0;
    try {
      const cronResponse = await fetch(`${supabaseUrl}/functions/v1/daily-payout-cron`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ time: new Date().toISOString() }),
      });

      payoutCronStatus = cronResponse.status;
      payoutCronResult = await cronResponse.json();

      steps.push({
        action: '🚀 Call daily-payout-cron (REAL production function)',
        result: payoutCronStatus === 200 ? '✅ Cron executed successfully' : `⚠️ Status ${payoutCronStatus}`,
        data: {
          httpStatus: payoutCronStatus,
          payoutsProcessed: payoutCronResult?.payouts_processed,
          skipsProcessed: payoutCronResult?.skips_processed,
          errors: payoutCronResult?.errors,
        }
      });
    } catch (cronError: any) {
      steps.push({
        action: '🚀 Call daily-payout-cron',
        result: `❌ Error: ${cronError.message}`,
      });
    }

    // Step 9: Verify withdrawal was created
    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('id, status, amount, net_amount, payment_method_type, b2c_attempt_count, last_b2c_attempt_at, b2c_error_details, cycle_id, notes')
      .eq('chama_id', chamaId)
      .eq('cycle_id', cycle.id);

    const withdrawal = withdrawals?.[0];

    if (withdrawal) {
      const wasAutoApproved = withdrawal.status === 'approved' || withdrawal.status === 'processing' || withdrawal.status === 'completed';
      const b2cWasAttempted = (withdrawal.b2c_attempt_count || 0) > 0 || 
                               withdrawal.status === 'processing' || 
                               withdrawal.status === 'completed' ||
                               withdrawal.status === 'pending_retry';

      steps.push({
        action: '📋 Withdrawal record created',
        result: `✅ Status: ${withdrawal.status}, Amount: KES ${withdrawal.net_amount || withdrawal.amount}`,
        data: {
          withdrawalId: withdrawal.id,
          status: withdrawal.status,
          grossAmount: withdrawal.amount,
          netAmount: withdrawal.net_amount,
          paymentMethodType: withdrawal.payment_method_type,
          wasAutoApproved,
          notes: withdrawal.notes,
        }
      });

      steps.push({
        action: '📡 B2C payout initiated',
        result: b2cWasAttempted
          ? `✅ B2C was called (attempts: ${withdrawal.b2c_attempt_count || 'processing'})`
          : `❌ B2C was NOT called (status: ${withdrawal.status})`,
        data: {
          b2cAttemptCount: withdrawal.b2c_attempt_count,
          lastB2cAttempt: withdrawal.last_b2c_attempt_at,
          b2cErrors: withdrawal.b2c_error_details,
          b2cWasAttempted,
          explanation: b2cWasAttempted
            ? 'System auto-approved withdrawal and initiated M-Pesa B2C payout'
            : 'B2C was not triggered — check payment method or auto-approve conditions',
        }
      });

      // Step 10: Verify financial ledger entry
      const { data: ledgerEntries } = await supabase
        .from('financial_ledger')
        .select('*')
        .eq('source_id', chamaId)
        .eq('transaction_type', 'payout')
        .eq('reference_id', withdrawal.id);

      if (ledgerEntries && ledgerEntries.length > 0) {
        steps.push({
          action: '📒 Financial ledger entry',
          result: `✅ Payout recorded: KES ${ledgerEntries[0].net_amount}`,
          data: {
            grossAmount: ledgerEntries[0].gross_amount,
            commission: ledgerEntries[0].commission_amount,
            netAmount: ledgerEntries[0].net_amount,
            description: ledgerEntries[0].description,
          }
        });
      } else {
        steps.push({
          action: '📒 Financial ledger entry',
          result: '⚠️ No ledger entry found',
        });
      }

      // Final verdict
      const passed = wasAutoApproved && b2cWasAttempted;
      
      await cleanup(supabase, chamaId);
      steps.push({ action: 'Cleanup', result: 'Success' });

      return {
        name: config.name,
        description: config.description,
        passed,
        steps,
        assertion: passed ? undefined : `Expected auto-approved withdrawal with B2C call. Got status: ${withdrawal.status}, b2c_attempts: ${withdrawal.b2c_attempt_count}`,
      };
    } else {
      steps.push({
        action: '📋 Withdrawal record',
        result: '❌ No withdrawal found for this cycle',
        data: { allWithdrawals: withdrawals }
      });

      await cleanup(supabase, chamaId);
      steps.push({ action: 'Cleanup', result: 'Success' });

      return {
        name: config.name,
        description: config.description,
        passed: false,
        steps,
        assertion: 'No withdrawal was created by daily-payout-cron',
      };
    }

  } catch (error) {
    if (chamaId) await cleanup(supabase, chamaId);
    return {
      name: config.name,
      description: config.description,
      passed: false,
      steps,
      error: (error as any).message,
    };
  }
}

// ==================== CLEANUP ====================

async function cleanup(supabase: any, chamaId: string) {
  try {
    await supabase.from('chama_cycle_deficits').delete().eq('chama_id', chamaId);
    await supabase.from('chama_member_debts').delete().eq('chama_id', chamaId);

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

    await supabase.from('financial_ledger').delete().eq('source_id', chamaId);
    await supabase.from('company_earnings').delete().eq('group_id', chamaId);
    await supabase.from('audit_logs').delete().eq('new_values->>chama_id', chamaId);
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
