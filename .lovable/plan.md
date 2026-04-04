

# Chama Engine Deep Fix Plan

## Root Cause Analysis from Database Evidence

The "Kings Self Help Group" data reveals these concrete failures:

| Finding | Data Evidence | Root Cause |
|---------|--------------|------------|
| **15 cycles created** for 2 members | `contribution_cycles` has cycles #1-#15, all with `payout_amount: 0` | GAP RECOVERY fix was deployed after damage was done; also the cap logic `activeMembers.length - latestCycle.cycle_number` is wrong — it should cap total cycles to `activeMembers.length`, not calculate remaining |
| **Payments not linked** | 2 contributions exist (KES 100 each) but all 30 `member_cycle_payments` show `amount_paid: 0` | C2B callback delegates to `settle-only`, but `settleDebts` Step 3 cycle lookup used date-only comparison before fix; also `first_payment_completed` is still `false` for both members |
| **No auto-removal** | `missed_payments_count: 1` for both members, `chama_member_removals` is empty | The `missed_payments_count` should be ~14 but only incremented once — GAP RECOVERY creates cycles with `payout_processed: true` so they skip the TRACK MISSED PAYMENTS section entirely |
| **KES 0 payout sent to admin** | `payout_approval_requests` with `payout_amount: 0` | `available_balance: 0` because payments never went through settlement |
| **Member #1 rescheduled to position #3** | `rescheduled_to_position: 3` with only 2 members | Cap fix deployed but only for future — the data already has the wrong value |
| **KES 5 outstanding on day 1** | Commission (5%) treated as outstanding | The dashboard shows `totalPayable = contribution + outstanding` where outstanding includes commission calculations |

## Implementation Plan

### Step 1: Fix GAP RECOVERY Cycle Cap Logic (Critical)

**File**: `supabase/functions/daily-payout-cron/index.ts` (~line 338)

Current code: `MAX_CATCHUP_CYCLES = Math.min(50, activeMembers.length - latestCycle.cycle_number)`

This is wrong. For a 2-member chama at cycle 15, this evaluates to `2 - 15 = -13`. The fix should count total existing cycles, not use subtraction from the latest:

```
const { count: existingCycleCount } = await supabase
  .from('contribution_cycles')
  .select('*', { count: 'exact', head: true })
  .eq('chama_id', chama.id);

const maxTotalCycles = activeMembers.length; // Single round ROSCA
const remainingCycles = maxTotalCycles - (existingCycleCount || 0);

if (remainingCycles <= 0) {
  // Mark as cycle_complete
  continue;
}
const MAX_CATCHUP_CYCLES = Math.min(50, remainingCycles);
```

### Step 2: GAP RECOVERY Must Track Missed Payments

**File**: `supabase/functions/daily-payout-cron/index.ts` (~lines 431-449)

Gap-recovered cycles are created with `payout_processed: true`, so the NORMAL PROCESSING section (which increments `missed_payments_count` and triggers auto-removal) never sees them. 

**Fix**: After creating each gap-recovered cycle and its `member_cycle_payments`, immediately increment `missed_payments_count` for all members and check for auto-removal (>= 3 misses). Extract the missed-payment tracking + auto-removal logic into a reusable function called from both GAP RECOVERY and NORMAL PROCESSING.

### Step 3: Fix C2B Callback — Mark first_payment_completed

**File**: `supabase/functions/c2b-confirm-payment/index.ts` (~line 152, after contribution recorded)

The C2B callback records the contribution but never marks `first_payment_completed = true`. Add:
```typescript
if (!chamaMemberData.first_payment_completed) {
  await supabase.from('chama_members').update({
    first_payment_completed: true,
    first_payment_at: new Date().toISOString(),
  }).eq('id', chamaMemberData.id);
}
```

Also ensure the C2B callback does NOT reassign `order_index` or `member_code` (already handled by `chama-start`).

### Step 4: Fix settle-only to Also Update first_payment_completed

**File**: `supabase/functions/contributions-crud/index.ts` (~line 709, in settle-only block)

When the `settle-only` action runs, check if the member's `first_payment_completed` is false and the chama is active. If so, mark it true without changing order_index/member_code.

### Step 5: Chama End Date — Auto-Complete When All Turns Done

**File**: `supabase/functions/daily-payout-cron/index.ts`

After processing a cycle where `cycle_number >= activeMembers.length`, check if all members have had their turn. If the final cycle is processed, update chama status to `cycle_complete` and set `last_cycle_completed_at`. This already exists in GAP RECOVERY but needs to also run after NORMAL PROCESSING completes the last cycle.

### Step 6: Clean Up the Broken Test Chama Data

**Migration**: Reset the "Kings Self Help Group" to a valid state:
- Delete excess cycles (#3 through #15) — only 2 cycles should exist for 2 members
- Update `member_cycle_payments` for cycles #1 and #2 to reflect the actual KES 100 payments made
- Reset `missed_payments_count` to accurate values
- Fix `rescheduled_to_position` from 3 to 2 (or null)
- Set `first_payment_completed = true` for both members
- Update `chama_member_debts` to cleared status since payments were made
- Set chama status to `cycle_complete` since both cycles should be done
- Update `available_balance` and `total_gross_collected` to reflect actual payments

### Step 7: Fix Admin Payout Approval for KES 0

**File**: `supabase/functions/daily-payout-cron/index.ts` (~line 671-684)

Currently creates an admin approval request even when `approvalPayoutAmount = 0`. Add a guard:
```typescript
if (approvalPayoutAmount <= 0) {
  // Skip creating approval request — nothing to pay out
  // Just mark cycle as processed with no payout
}
```

### Step 8: Ensure Deployed Functions Are Current

Deploy all modified edge functions after changes:
- `daily-payout-cron`
- `contributions-crud`
- `c2b-confirm-payment`

---

## Technical Summary

### Edge Functions Modified
1. `daily-payout-cron/index.ts` — Fix cycle cap math, extract missed-payment tracker, auto-complete after final cycle, skip KES 0 approvals
2. `contributions-crud/index.ts` — settle-only marks first_payment_completed
3. `c2b-confirm-payment/index.ts` — Mark first_payment_completed on C2B payments

### Database Migration
- Clean up Kings Self Help Group data (delete excess cycles, fix member records, settle actual payments, mark cycle_complete)

### Files NOT Changed
- Frontend components (previous fixes to `PaymentCountdownTimer`, `DailyPaymentStatus`, `ContributionsPDFDownload`, `ChamaInviteManager` remain as-is — they were correct)

