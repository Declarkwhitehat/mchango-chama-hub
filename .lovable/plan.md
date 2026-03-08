

## Run Chama Simulation Tests

### Problem
The database has only 1 chama (pending, 1 member, 0 cycles) — nothing to test automatic payouts or member skipping against.

### Plan

**Create a `simulate-chama-test` edge function** that:
1. **Seeds test data** using real user IDs from the database (4 members from existing profiles)
2. **Creates a test chama** (daily frequency, KES 100, status=active)
3. **Creates 3 contribution cycles** with mixed payment states:
   - Cycle 1: All 4 members paid → full payout to Member 1
   - Cycle 2: Member 2 (beneficiary) did NOT pay → should be skipped, payout redirected to Member 3
   - Cycle 3: Member 3 (beneficiary) paid but has outstanding debt from cycle 2 → should be skipped
4. **Runs the payout logic** (calls `daily-payout-cron` internally against the test chama)
5. **Reads back results**: withdrawals, payout_skips, chama_member_debts, chama_cycle_deficits
6. **Returns a structured JSON report** showing exactly what happened at each step
7. **Cleans up** all test data after reporting (deletes the test chama and cascaded records)

All B2C/SMS calls will be **skipped** (the function uses `dryRun: true` mode — it replicates the decision logic without triggering real payments).

**Add a "Run Simulation" button** in ChamaDetail page (visible only to managers) that calls this function and displays the results in a dialog.

### Files
| Action | File |
|--------|------|
| Create | `supabase/functions/simulate-chama-test/index.ts` |
| Edit | `supabase/config.toml` — register the new function |
| Edit | `src/pages/ChamaDetail.tsx` — add simulation trigger button + results dialog |

### Test Scenarios
1. **Happy path**: All members pay on time → beneficiary gets full payout
2. **Beneficiary skip**: Beneficiary hasn't paid → skipped, next eligible member gets payout, debt+deficit created
3. **No eligible members**: Multiple members haven't paid → no payout, all debts accrued
4. **Debt blocks payout**: Member has outstanding debt even though current cycle is paid → still ineligible

