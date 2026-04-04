

# Chama System Bug Fixes Plan

This plan addresses the critical issues you reported with the Kings Self Help Group chama. There are multiple interconnected bugs across invite management, payment processing, cycle creation, and the dashboard display.

---

## Problem Summary

| # | Issue | Root Cause |
|---|-------|------------|
| 1 | Multiple invite links shown | `generate` action doesn't deactivate previous codes |
| 2 | Member ID changed after first payment (GJ5XM0001 → GJ5XM0003) | `contributions-crud` re-assigns `order_index` and `member_code` on first payment even though `chama-start` already assigned them |
| 3 | Payments not recognized / "KES 0 paid" | Payment recorded in `contributions` table but `settleDebts()` can't find active cycle (date mismatch during grace period) |
| 4 | Unlimited cycles created (3+ cycles for 2 members) | GAP RECOVERY in `daily-payout-cron` creates cycles indefinitely — not bounded by member count |
| 5 | Contradictory amounts (KES 205, 305, 405) | Penalty (10%) added on top of principal debt (KES 100 + KES 10 penalty = KES 110 per missed cycle), but amounts compound incorrectly |
| 6 | Rescheduled to position #3 with only 2 members | Skip logic sets `newPosition = lastPosition + 1` without capping to member count |
| 7 | Reminder sent during grace period | Reminder cron doesn't check if cycle is still in grace period |
| 8 | No auto-removal after 3 missed payments | Members never removed because cycle payments are never marked as missed properly |
| 9 | PDF missing reference and time | `ContributionsPDFDownload` doesn't include payment reference or timestamp |

---

## Implementation Plan

### Step 1: Fix Invite Link — Single Active Code Only

**Files**: `supabase/functions/chama-invite/index.ts`, `src/components/ChamaInviteManager.tsx`

- In the `generate` action handler, **deactivate all existing active unused codes** for the chama before inserting a new one:
  ```sql
  UPDATE chama_invite_codes SET is_active = false 
  WHERE chama_id = ? AND is_active = true AND used_by IS NULL
  ```
- **Remove** the batch generate action from the edge function and the batch generate UI section from `ChamaInviteManager.tsx`
- The UI will only ever show one active code at a time

### Step 2: Fix Member ID Change on First Payment

**File**: `supabase/functions/contributions-crud/index.ts` (lines 884-921)

- The `chama-start` function already assigns `order_index`, `member_code`, and marks members as active with `first_payment_completed` implicitly ready
- However, `contributions-crud` checks `if (!member.first_payment_completed)` and **re-assigns** order index and member code
- **Fix**: When the chama is already `active` (started), skip the first-payment activation block entirely — the member already has their assigned position from `chama-start`
- Add a guard: only run first-payment activation if `chama.status === 'pending'` (pre-start joining flow, not applicable here)

### Step 3: Fix Payment Not Linking to Cycle

**File**: `supabase/functions/contributions-crud/index.ts` (settleDebts function, ~line 420-428)

- The cycle lookup uses `lte('start_date', today)` and `gte('end_date', today)` — but the grace period cycle's `end_date` is set to the next day at 10 PM
- For a payment made on the start day (Mar 19), `today = '2026-03-19'` and `end_date = '2026-03-20T22:00:00'` — this should match correctly
- **Actual issue**: The offline payment flow may be passing `gross_amount = 100` but the settlement expects `gross_amount = 105` (100 + 5% commission) to fully clear the cycle
- **Fix**: Ensure the offline payment form sends `amount = contribution_amount * (1 + commission_rate)` as the gross, OR adjust the settlement to treat offline payments at face value (net = amount, deduct commission from the pool separately)
- Also add an `actual_payment_date` field to contributions to support the user's choice of storing both dates

### Step 4: Bound Cycle Count to Member Count

**File**: `supabase/functions/daily-payout-cron/index.ts` (GAP RECOVERY section, ~lines 310-445)

- Currently, GAP RECOVERY creates up to 50 catch-up cycles regardless of how many members exist
- **Fix**: Add a check — total cycles should not exceed `memberCount * maxRounds` (for a single-round ROSCA, max cycles = member count)
- After all members have had their turn (cycle_number > member_count), the chama should transition to `cycle_complete` status instead of creating more cycles
- Add: `if (nextCycleNum > activeMembers.length) { mark chama as cycle_complete; break; }`

### Step 5: Fix Outstanding Amount Calculations

**Files**: `supabase/functions/member-dashboard/index.ts`, `src/components/chama/PaymentCountdownTimer.tsx`, `src/components/MemberDashboard.tsx`

- The `totalOutstanding` in member-dashboard sums `amount_due - amount_paid` from `member_cycle_payments` where `is_paid = false`
- But the `PaymentCountdownTimer` receives `totalPayable` which is `contributionAmount + totalOutstanding` — this double-counts the current cycle
- **Fix**: `totalPayable` should be `totalOutstanding` (which already includes the current cycle's unpaid amount) — not `contributionAmount + totalOutstanding`
- Ensure penalty amounts (10% per missed cycle) are only from `chama_member_debts`, not added again in the UI
- The "Pay KES X" button in the M-Pesa form should show the **total gross payable** including commission and outstanding debts

### Step 6: Fix Rescheduled Position Exceeding Member Count

**File**: `supabase/functions/daily-payout-cron/index.ts` (~line 548-549)

- Currently: `newPosition = lastPosition + 1` which can go to 3 even with only 2 members
- **Fix**: Cap `newPosition` to `activeMembers.length` (wrap around). For a 2-member chama, if member #1 is skipped, they become #2 (last position)

### Step 7: Skip Reminders During Grace Period

**File**: `supabase/functions/daily-reminder-cron/index.ts`

- Add a check: if the cycle's `start_date` is within the last 24 hours (grace period), skip sending reminders for that cycle
- Compare `cycle.start_date` + 24 hours against `now()` — only send reminders after grace period expires

### Step 8: Fix PDF Missing Reference and Time

**File**: `src/components/ContributionsPDFDownload.tsx`

- Add `payment_reference` and `contribution_date` (with time) columns to the PDF table
- Ensure the data passed to the PDF generator includes these fields from the contributions query

---

## Technical Details

### Database Changes
- Add `actual_payment_date` column to `contributions` table (timestamptz, nullable) for offline payment tracking

### Edge Functions Modified
1. `chama-invite/index.ts` — deactivate old codes on generate, remove batch
2. `contributions-crud/index.ts` — fix first-payment guard, fix gross amount handling
3. `daily-payout-cron/index.ts` — bound cycles to member count, fix skip position
4. `daily-reminder-cron/index.ts` — grace period check
5. `member-dashboard/index.ts` — fix outstanding calculation

### Frontend Components Modified
1. `ChamaInviteManager.tsx` — remove batch UI, show single code
2. `PaymentCountdownTimer.tsx` — fix totalPayable calculation
3. `MemberDashboard.tsx` — consistent outstanding display
4. `ContributionsPDFDownload.tsx` — add reference + time
5. `ChamaPaymentForm.tsx` — send correct gross amount

