

## Plan: Chama Payment System Overhaul

### Summary
Fix allocation preview labels, correct the "Total Collected" display to show who paid, and implement the strict first-payment removal rule (Day 1 defaulters removed at 10 PM). The core payout, debt, skip, carry-forward, auto-remove, and manager succession logic is already implemented correctly. This plan focuses on the UI/label bugs and the missing Day 1 removal enforcement.

---

### What's Already Working (No Changes Needed)

Reviewing the codebase against your 10-point spec, most rules are already implemented:

- Daily cycle at 10 PM cutoff (daily-cycle-manager, daily-payout-cron)
- Missed payment tracking with debt + 10% penalty (accrueDebtsForCycle)
- FIFO settlement: penalties → principal → current cycle → carry-forward (contributions-crud settleDebts)
- Payout from available_balance (partial if shortage)
- Skip ineligible beneficiaries to end of queue (findNextEligibleMember, recordPayoutSkip)
- Overpayment → carry-forward credit (never covers other members)
- 3 missed payments → auto-removal
- Manager auto-succession (best candidate by missed count + order)
- Late payment = original + 10% penalty (LATE_RATE = 0.10)
- Deductive commission model (5% deducted from payment)

---

### Issues to Fix

#### 1. Fix Allocation Preview Labels
**File:** `src/components/chama/PaymentAllocationPreview.tsx`

The label "Net to cycle collection pot KES 4.75" is confusing. When someone pays KES 100:
- KES 5 (5%) → Platform revenue
- KES 95 → Chama pool (goes to beneficiary at payout)

Change labels:
- "Total commissions to platform" → "Platform commission (5%)"
- "Net to cycle collection pot" → "To chama pool (for beneficiary payout)"
- Remove the word "net" from user-facing text

#### 2. Fix "Total Collected" to Show Who Paid
**File:** `src/components/chama/DailyPaymentStatus.tsx`

The Financial Summary shows "Total Collected: KES 190" but doesn't say who contributed. Change the "Total Collected" card to list paid members and their amounts, or add a subtitle showing paid member names.

#### 3. Implement Day 1 First-Payment Removal Rule
**Files:** `supabase/functions/daily-payout-cron/index.ts`, `supabase/functions/chama-start/index.ts`

Currently, members who don't pay by the first deadline are treated like any other missed payment (tracked as debt, removed after 3 misses). The user wants **immediate removal** of anyone who doesn't pay by the first 10 PM deadline.

Changes:
- In `daily-payout-cron`, when processing the **first cycle** (cycle_number === 1), any unpaid member is immediately removed (not just debt-accrued). This is different from subsequent cycles where they get 3 chances.
- After removing Day 1 defaulters, resequence remaining members and recalculate the beneficiary for the payout.
- Update the grace period UI messaging to make clear: "Members who don't pay by the deadline will be removed."

#### 4. Fix Daily Cycle Timing
**File:** `supabase/functions/daily-cycle-manager/index.ts` (create-today action)

For daily chamas, cycle end_date uses `setHours(22, 0, 0, 0)` which is local timezone, not Kenya time. Should use UTC 19:00 (Kenya 10 PM) consistently.

Change line 96: `endDate.setHours(22, 0, 0, 0)` → set to Kenya 10 PM (19:00 UTC) using the chamaDeadlines utility.

Similarly fix gap recovery cycle creation in `daily-payout-cron` (line 369).

---

### Technical Details

**Files modified:**
- `src/components/chama/PaymentAllocationPreview.tsx` — Fix labels
- `src/components/chama/DailyPaymentStatus.tsx` — Show who paid in financial summary
- `supabase/functions/daily-payout-cron/index.ts` — Add Day 1 removal logic for cycle_number === 1
- `supabase/functions/daily-cycle-manager/index.ts` — Fix daily cycle end_date to Kenya 10 PM UTC
- `src/components/chama/PaymentCountdownTimer.tsx` — Update grace period warning text

**No database migrations needed.**

**Edge functions to deploy:** daily-payout-cron, daily-cycle-manager

