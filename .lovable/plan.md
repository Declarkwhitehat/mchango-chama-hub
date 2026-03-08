

## Comprehensive 30-Member Chama Simulation

### Problem
Current simulation only tests 4 members with basic scenarios. You want a full-scale 30-member daily chama simulation covering **all edge cases** including overpayments, carry-forward credit, FIFO debt settlement, auto-removal, and multi-cycle progression.

**Database note**: Only 23 user profiles exist. The simulation will reuse profiles to fill 30 member slots (same approach as existing simulation).

### Plan

**Rewrite `supabase/functions/simulate-chama-test/index.ts`** to run 10 comprehensive scenarios with 30 members paying KES 100 daily:

#### Scenarios

| # | Scenario | What It Tests |
|---|----------|--------------|
| 1 | **Happy Path** | All 30 pay on time → beneficiary gets full payout (KES 2,850 net after 5%) |
| 2 | **Overpayment (KES 200 instead of 100)** | Member pays double → 5% commission on excess, remainder stored as `carry_forward_credit` |
| 3 | **Carry-Forward Auto-Apply** | Member with credit from Scenario 2 → next cycle auto-deducted from credit, no new payment needed |
| 4 | **Partial Payment** | 5 members pay KES 50 instead of 100 → cycle incomplete, partial payout from `available_balance` |
| 5 | **Beneficiary Skip (unpaid)** | Beneficiary (Member 3) hasn't paid → skipped to end of queue, payout redirected to Member 4 |
| 6 | **Beneficiary Skip (has debt)** | Beneficiary paid current cycle but has outstanding debt from prior cycle → still ineligible |
| 7 | **Multiple Skips Cascade** | Members 5, 6, 7 are all ineligible → system finds Member 8 as first eligible |
| 8 | **No Eligible Members** | All potential beneficiaries have debts/unpaid → no payout this cycle |
| 9 | **Late Payment (10% commission)** | Member pays after 22:00 deadline → 10% commission instead of 5%, debt accrued with penalty |
| 10 | **Auto-Removal (3 misses)** | Member misses 3 consecutive payments → auto-removed, manager notified, queue resequenced |

#### For Each Scenario the Report Shows:
- Step-by-step trace of every action taken
- Eligibility check results (unpaid cycles, debts, shortfall)
- Commission calculations (5% on-time vs 10% late)
- Carry-forward credit tracking
- Debt and deficit records created
- Skip records and queue repositioning
- Payout amounts and recipients
- Pass/fail assertion with reason

#### Findings Section
The report will include a `findings` summary analyzing:
- Total platform revenue (commissions + penalties)
- Total payouts disbursed
- Carry-forward credits outstanding
- Members removed vs active
- Deficit records outstanding
- Any logic inconsistencies found

### Files

| Action | File |
|--------|------|
| Rewrite | `supabase/functions/simulate-chama-test/index.ts` — Full 30-member simulation with 10 scenarios |
| Edit | `src/pages/ChamaDetail.tsx` — Update results dialog to handle expanded report format |

### Technical Notes
- All test data cleaned up after each scenario (isolated tests)
- No real M-Pesa/SMS calls — pure logic simulation
- Uses service role key to bypass RLS
- Profiles are reused across 30 member slots (23 real profiles + 7 reused)
- Each scenario creates its own chama to avoid cross-contamination

