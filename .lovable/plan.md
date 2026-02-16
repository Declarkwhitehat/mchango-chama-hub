
# Fix Plan: "The Declarks" Chama Cycle & Payment Logic

## Problems Found

After investigating the database and code, here are the issues causing incorrect behavior for "The Declarks" chama:

### Bug 1: Chama Start Does NOT Create Member Cycle Payments
When the manager starts the chama (`chama-start`), cycle 1 is created but **no `member_cycle_payments` records are created** for the members. Without these records, the system can't track who paid and who didn't for each cycle.

### Bug 2: Daily Payout Cron Uses Exact Date Match (Misses Cycles)
The daily payout cron (`daily-payout-cron`) filters cycles with `.eq('end_date', today)` where `today` is a date string like `2026-01-23`. But the cycle's `end_date` is stored as a full timestamp (`2026-01-23 18:47:55.211+00`). An exact equality check **never matches**, so the cycle is permanently skipped and never processed. No new cycles are created after it, no payouts happen, and no missed payments are tracked.

### Bug 3: Cycle End Date Calculation is Off by One
In `chama-start`, the `calculateCycleEndDate` function adds the full cycle length to the start date. For daily frequency, this means `start + 1 day` instead of `start + 0 days` (same day). A daily cycle starting Jan 22 should end Jan 22 (same day), not Jan 23.

### Bug 4: No Catch-Up Logic for Missed Cron Runs
If the daily cron misses a day (or the date-matching bug prevents processing), there's no mechanism to process overdue cycles. Cycles that passed their end date without being processed are stuck forever.

### Current State of "The Declarks"
- 2 members, daily contribution of KES 100, started Jan 22
- Only 1 cycle exists (cycle 1), end_date Jan 23 -- never processed
- Zero `member_cycle_payments` records -- nobody's payments are tracked
- Both members contributed once (KES 100 each) but `first_payment_completed` is still false
- `missed_payments_count = 0` for both -- should be much higher after 24+ days
- A withdrawal of KES 190 was completed on Jan 28 despite the system not tracking payments properly

---

## Fix Plan

### 1. Fix `chama-start`: Create member_cycle_payments when starting
After creating the first contribution cycle, create a `member_cycle_payments` record for each approved member so the system can track per-cycle payment status from day one.

### 2. Fix `daily-payout-cron`: Use date range instead of exact match
Change the cycle query from `.eq('end_date', today)` to `.lte('end_date', now)` combined with `.eq('payout_processed', false)`. This catches both same-day and overdue cycles, providing catch-up capability.

### 3. Fix cycle end date calculation in `chama-start`
For daily frequency, the end date should be the same day as start (or end of that day). Adjust the calculation so daily cycles end on start_date, not start_date + 1.

### 4. Fix "The Declarks" data
Run a data correction to:
- Create the missing `member_cycle_payments` for the stuck cycle
- Allow the daily cron to naturally catch up and process overdue cycles once the code fixes are deployed

---

## Technical Details

### File: `supabase/functions/chama-start/index.ts`
- After creating `firstCycle`, insert `member_cycle_payments` for each approved member with `amount_due = contribution_amount`, `amount_paid = 0`, `fully_paid = false`
- Fix `calculateCycleEndDate` for daily frequency: end date = same day (set to 23:59:59)

### File: `supabase/functions/daily-payout-cron/index.ts`
- Change line 213 from `.eq('end_date', today)` to `.lte('end_date', new Date().toISOString())` to catch overdue cycles
- Process cycles in order (oldest first) to handle catch-up correctly
- Limit to one cycle per chama per cron run to avoid processing too many at once

### File: `supabase/functions/cycle-auto-create/index.ts`
- Ensure the end date for daily cycles uses end-of-day timestamps (23:59:59) for consistent matching

### Database: Data Repair for "The Declarks"
- Insert missing `member_cycle_payments` records for cycle 1
- The fixed cron will then naturally process the overdue cycle and create subsequent ones
