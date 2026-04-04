

## Goal

Fix multiple bugs and UX issues on the member dashboard during the 24-hour grace period, and clean up the repetitive/cluttered layout for a more professional design.

## Problems Identified

1. **KES 105 amount**: `PaymentCountdownTimer` calculates `totalPayable = (totalOutstanding + cycleInfo.due_amount) * 1.05 = (0 + 100) * 1.05 = 105`. The 5% commission should not be shown as the "amount to pay" since commission is charged on top at payment time, not displayed as a lump sum here.

2. **Outstanding balance of KES 100 during grace period**: The `MemberDashboard` shows an "Outstanding Balance" card because `member_cycle_payments` records exist with `is_paid: false` and `amount_remaining: 100`. The system treats unpaid cycle payment records as missed payments even though the grace period hasn't ended.

3. **Missed payment record created prematurely**: The `member_cycle_payments` records are created at chama start with `is_paid: false`. The `daily-cycle-manager` `all-cycles` action likely marks them as `status: 'missed'` since `is_paid` is false, without checking whether the cycle's end date has passed.

4. **Countdown timer shows "2 days 15 hours"**: The cycle `end_date` is `2026-04-05 22:00:00+00` and the timer counts down to 10PM cutoff on that date. Since the cutoff IS the end_date (already at 22:00), calling `cutoff.setHours(22,0,0,0)` on an already-22:00 date works correctly in UTC but may double-count in local timezone. The actual remaining time is ~1 day 18 hours, which aligns with the grace period ending tomorrow at 10PM.

5. **Repetitive tabs/cards**: The page shows `CyclePaymentStatus` (with countdown, payment history, financial summary, and detailed payment status) PLUS a separate `MemberDashboard` tab that duplicates outstanding balance, missed payments, and payment history. This creates massive visual clutter.

## Implementation Plan

### 1. Add grace period awareness to the frontend

**Files**: `src/components/chama/DailyPaymentStatus.tsx`, `src/components/chama/PaymentCountdownTimer.tsx`

- Detect if the chama is within its 24-hour grace period by comparing `now` against `chama.start_date + 24 hours`.
- Pass a `isGracePeriod` flag from `CyclePaymentStatus` to `PaymentCountdownTimer`.
- During grace period:
  - Show the countdown as "Grace Period — First payment due by [date]" instead of urgency warnings.
  - Suppress "missed cycles" alerts and outstanding balance displays.
  - Change timer styling to informational (blue/neutral) rather than warning/urgent.
  - Hide the "Unpaid Members" destructive list — everyone is unpaid during grace period.

### 2. Fix the KES 105 calculation

**File**: `src/components/chama/DailyPaymentStatus.tsx`

- Change `totalPayable` to show the base contribution amount (KES 100) rather than `amount * 1.05`. Commission is an on-top charge handled at payment time, not a pre-displayed figure.
- Only add commission/penalty multipliers when there are actual outstanding debts from previous cycles.

### 3. Suppress false missed-payment data during grace period

**File**: `src/components/MemberDashboard.tsx`

- Add grace period check: if `chama.status === 'active'` and `start_date` is within the last 24 hours, suppress the "Outstanding Balance" card, "Missed Payments Record" table, and warning banners.
- The `member_cycle_payments` records with `is_paid: false` are expected during grace period — they should not trigger UI warnings.

**File**: `supabase/functions/daily-cycle-manager/index.ts` (the `all-cycles` action)

- When determining cycle status (paid/missed/pending), check if the cycle's `end_date` is still in the future. If so, status should be `'pending'` not `'missed'`.

### 4. Consolidate repetitive UI elements

**File**: `src/pages/ChamaDetail.tsx`

- Remove the standalone `CyclePaymentStatus` component that appears above the tabs (lines 576-585), since the `MemberDashboard` tab already includes it (line 347).
- Remove the duplicate "Payment Required!" red banner (lines 766-792) since `PaymentCountdownTimer` already shows pay-now urgency.
- The `MemberDashboard` tab becomes the single source for all payment-related information.

**File**: `src/components/MemberDashboard.tsx`

- Remove the duplicate "Outstanding Balance" card (lines 273-304) — the `CyclePaymentStatus`/`PaymentCountdownTimer` already shows what's due.
- Remove the duplicate "Missed Payments Record" table (lines 306-344) — the per-cycle payment history in `CyclePaymentStatus` already shows this.
- Remove the duplicate "Balance Information" card at the bottom (lines 535-567) — already shown in the member info grid.
- Keep: Member info card, payout schedule, payment history table, and `CyclePaymentStatus` (which is the consolidated payment view).

### 5. Professional design cleanup

**File**: `src/components/MemberDashboard.tsx`

- Reorder remaining cards for clarity: (1) Grace period or payment timer, (2) Member info with balance, (3) Payout schedule, (4) Payment history.
- Use consistent spacing and card styling.

**File**: `src/components/chama/PaymentCountdownTimer.tsx`

- Add a grace period visual state: calming blue card with shield/info icon, clear "No payment penalties during this period" message.

### 6. Fix countdown timezone handling

**File**: `src/components/chama/PaymentCountdownTimer.tsx`

- The `cutoff.setHours(22, 0, 0, 0)` call uses local timezone but `end_date` is already set to 22:00 UTC. Remove the redundant `setHours` call and use the `endDate` directly as the cutoff, since it already represents the payment deadline.

## Technical Details

- No database migrations needed.
- Edge function `daily-cycle-manager` needs a small fix in the `all-cycles` action to not mark future-end-date cycles as "missed".
- The grace period is determined client-side by checking if `Date.now() < new Date(chama.start_date).getTime() + 24*60*60*1000`.
- Files affected:
  - `src/pages/ChamaDetail.tsx`
  - `src/components/MemberDashboard.tsx`
  - `src/components/chama/DailyPaymentStatus.tsx`
  - `src/components/chama/PaymentCountdownTimer.tsx`
  - `supabase/functions/daily-cycle-manager/index.ts`

