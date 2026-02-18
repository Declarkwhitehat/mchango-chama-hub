
# Late Payment, Deadline Lock & Disbursement Rule Changes

## Summary of What You Want vs. What Exists

| Feature | Current Behavior | Required Behavior |
|---|---|---|
| Deadline hour | 8:00 PM (20:00) | 10:00 PM (22:00) |
| Payments after deadline | Flagged as late, credited to next cycle | Locked for normal payment, charged 10% penalty, counted for THIS cycle |
| Disbursement timing | At 10 PM, or when all pay | At 10:00 PM exactly |
| Partial disbursement | Payout only if enough collected | Release whatever is collected to beneficiary at 10 PM |
| Overpayment covering others | Partially possible via carry-forward | Strictly forbidden — each member's obligation is completely isolated |
| UI display | Basic cycle status | Needs: Total expected, total collected, penalties collected, unpaid members list |

---

## Current System Architecture

The existing system has:
- `contributions-crud` — receives payments, allocates to cycles, triggers immediate payout if all members pay before cutoff
- `daily-payout-cron` — runs at scheduled intervals, processes overdue cycles
- `daily-cycle-manager` — manages cycle creation and current-cycle queries
- `PaymentCountdownTimer` — frontend countdown using 8:00 PM cutoff
- `DailyPaymentStatus` — shows who has/hasn't paid for a cycle
- `member_cycle_payments` — per-member, per-cycle payment record with `amount_due`, `amount_paid`, `fully_paid`, `is_late_payment`

---

## Changes Required

### 1. Deadline: Change 8:00 PM → 10:00 PM (22:00)

**Files to change:**
- `contributions-crud/index.ts` — line ~544: `cutoffTime.setHours(20, 0, 0, 0)` → `setHours(22, 0, 0, 0)`
- `daily-cycle-manager/index.ts` — line 252: `cutoff_time: '20:00:00'` → `'22:00:00'`; also lines 94-96 cutoff check
- `PaymentCountdownTimer.tsx` — `cutoffHour={20}` default prop and all references to "8:00 PM" text
- `DailyPaymentStatus.tsx` — line 96: `cutoff.setHours(20, 0, 0, 0)` and badge text "8:00 PM Cutoff"

---

### 2. Late Payment = 10% Penalty, Applied to THIS Cycle (Not Next)

**Current behavior:** After 8 PM, payment goes to `carry_forward_credit` for the next cycle. Member's current cycle remains unpaid.

**Required behavior:** After 10 PM, member can still pay, but:
- 10% commission is deducted from their gross payment
- The net is applied to complete **this** cycle's `member_cycle_payments` record
- The member is still counted as having paid (but "late") for THIS cycle
- This is distinct from `carry_forward` — it covers the current cycle

**Files to change:**
- `contributions-crud/index.ts` — in the `isLatePayment` branch (lines ~546-566), instead of sending late payment to carry-forward, apply it to the **current cycle** using 10% commission rate. The existing `allocatePayment()` function already handles `isLate` based on `cycleEndDate`, but currently the cycle end is set at 23:59:59 of the day, so after 10 PM the cycle end has not passed yet for daily chamas. The fix is: mark `isLate = true` when `now > 22:00` on cycle end date (not past the cycle entirely), and write the 10% commission allocation to the current cycle record.
- `daily-cycle-manager/index.ts` — `allocatePayment` equivalent logic must use 22:00 as the "late cutoff" for determining commission rate
- The `allocatePayment()` function inside `contributions-crud` computes `isLate` by comparing `now > cycleEndDate`. Since daily cycles end at `23:59:59`, late detection is currently broken for late-within-day payments. We must change to: `isLate = now.getHours() >= 22` on the cycle's day, or specifically compare against 22:00 on the cycle's end date.

---

### 3. Strict Overpayment Rule — No Cross-Member Covering

**Current behavior:** `carry_forward_credit` can theoretically build up and reduce `amount_due` for the next cycle, but the payout currently pulls from actual `amount_paid` in `member_cycle_payments`.

**Issue:** In `cycle-auto-create` and `daily-cycle-manager` (create-today action), a member's `carry_forward_credit` reduces their next cycle's `amount_due` — this is fine because it's their OWN credit. The strict rule means: member A's overpayment must NEVER go to member B's obligation. This is already the case since carry-forward is per-member. The main concern is:

- In `daily-payout-cron`, `collectedAmount` is calculated as sum of `amount_paid` for **paid members**. Unpaid members' obligations are NOT filled by others. This is correct.
- We need to add an explicit check: payout amount = only what paid members actually paid (no cross-subsidization).

**Change:** In `daily-payout-cron/index.ts`, change payout calculation:
```
// Only count payments from members who fully paid their own obligation
const fullyPaidMembers = payments?.filter(p => p.fully_paid) || [];
const collectedAmount = fullyPaidMembers.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
```
Also add a `late_penalties_collected` field to the cycle summary.

---

### 4. 10:00 PM Disbursement — Always Release What Was Collected

**Current behavior:** Cron processes at whatever time it runs. The `contributions-crud` triggers immediate payout only if ALL members paid on time.

**Required behavior:** At exactly 10:00 PM, release whatever was collected to the beneficiary. Do NOT wait for everyone to pay.

**Changes:**
- The daily cron runs at whatever schedule is configured. We need to ensure:
  - At 10 PM, the cycle's end for payout-trigger purposes is treated as 22:00, not 23:59:59
  - The cron's `end_date` check (`.lte('end_date', now)`) checks 23:59:59. We add a `payout_cutoff` concept: daily cycles trigger payout at 22:00, not at end of day.
  - In `daily-payout-cron`, change the query to also capture daily cycles where the current time >= 22:00 on the cycle's day, regardless of `end_date`.
  
**Approach:** Add a computed check — for daily frequency chamas, also fetch cycles where `start_date` matches today and the current time is past 22:00 on that day.

Or simpler: Change daily cycle `end_date` from `23:59:59` to `22:00:00`. This way the cron's existing `.lte('end_date', now)` check will naturally process the cycle after 10 PM.

**This is the cleanest fix** — change where we set `endDate` for daily cycles to `22:00:00` instead of `23:59:59` in both `daily-cycle-manager` and `cycle-auto-create`.

---

### 5. Payout Amount = Only What Was Actually Collected (After 10% Penalty)

**Required:** Recipient gets `sum of all member payments (net of commissions)`, regardless of whether all members paid.

**Current behavior:** This is already the case in `daily-payout-cron` — `collectedAmount` sums actual `amount_paid` values, not the expected total. The withdrawal is created for `collectedAmount` minus `commissionAmount`. **This already works correctly.**

We need to make sure:
- Late payments (with 10% penalty) are included in the collected amount
- The `commission_amount` in the withdrawal tracks BOTH on-time (5%) and late (10%) commissions

---

### 6. UI — Show Required Financial Summary

**Required display for each cycle:**
- Total expected amount
- Total collected amount  
- Total penalties collected (10% late fees)
- List of unpaid members (clearly highlighted)

**Files to change:**
- `DailyPaymentStatus.tsx` — Add a summary section at the top of the "Detailed Payment Status" card:
  - Total Expected: `totalCount × contributionAmount`
  - Total Collected: sum of `amount_paid` from all payments
  - Penalties Collected: sum of all late-payment commissions (10% × late payment amounts)
  - Unpaid: clearly listed with "Unpaid" badge
  
- `PaymentCountdownTimer.tsx` — Change all "8:00 PM" references to "10:00 PM"

---

## Technical Implementation Plan

### Step 1 — Backend: Fix Late-Payment Detection to 10:00 PM

In `contributions-crud/index.ts`, the `isLate` check and the `allocatePayment` function both need updating:

Current:
```typescript
// allocatePayment() line ~101
const cycleEndDate = new Date(cycle.contribution_cycles?.end_date);
const isLate = now > cycleEndDate; // This is wrong — cycle end is 23:59:59, not 22:00
```

Fix:
```typescript
const cycleEndDate = new Date(cycle.contribution_cycles?.end_date);
// Late if current time is past 22:00 on the cycle's start date
const lateDeadline = new Date(cycleEndDate);
lateDeadline.setHours(22, 0, 0, 0);
const isLate = now > lateDeadline;
```

And in the `isLatePayment` check in the POST handler (line ~543):
```typescript
// Change from 20:00 to 22:00
cutoffTime.setHours(22, 0, 0, 0);
```

### Step 2 — Backend: Fix Daily Cycle End Time to 22:00

In `daily-cycle-manager/index.ts` (create-today action) and `cycle-auto-create/index.ts`:

Change daily cycle end from:
```typescript
case 'daily':
  endDate.setHours(23, 59, 59, 999); // OLD
```
To:
```typescript
case 'daily':
  endDate.setHours(22, 0, 0, 0); // NEW — triggers payout at 10 PM
```

This ensures the cron processes daily cycles at/after 10 PM instead of midnight.

### Step 3 — Backend: Ensure Late Payments Count for THIS Cycle

Currently, the `isLatePayment` branch in `contributions-crud` sends the payment to carry-forward. We change it to instead allocate it to the current cycle with 10% commission.

The `allocatePayment()` function already handles this correctly if `isLate` is set properly (it uses `LATE_RATE = 0.10`). The issue is that the outer code in the POST handler treats late payments as going to next cycle carry-forward instead of clearing the current cycle.

**Fix:** Remove the special late-payment carry-forward branch; let `allocatePayment()` handle it normally. The function will apply 10% commission and mark the cycle payment as `is_late_payment = true`.

### Step 4 — Backend: Overpayment Isolation in Payout Cron

In `daily-payout-cron/index.ts`, update payout calculation to be explicit:

```typescript
// Only collect from members who paid their own obligation (no cross-subsidization)
const paidMembersOnTime = payments?.filter(p => p.fully_paid && !p.is_late_payment) || [];
const paidMembersLate = payments?.filter(p => p.fully_paid && p.is_late_payment) || [];
const unpaidMembers = payments?.filter(p => !p.fully_paid) || [];

const collectedFromOnTime = paidMembersOnTime.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
const collectedFromLate = paidMembersLate.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
const collectedAmount = collectedFromOnTime + collectedFromLate;
const totalPenalties = paidMembersLate.reduce((sum, p) => {
  return sum + ((p.amount_paid || 0) * 0.10 / 0.90); // approximate commission
}, 0);
```

Also update the cycle record to store `total_penalties_collected` in metadata.

### Step 5 — Frontend: Update Deadline to 10:00 PM

- `PaymentCountdownTimer.tsx`: Change default `cutoffHour` prop from `20` to `22`, and all text "8:00 PM" to "10:00 PM"
- `DailyPaymentStatus.tsx`: Change `cutoff.setHours(20, 0, 0, 0)` to `22`, text "8 PM" to "10 PM", update badge text

### Step 6 — Frontend: Enhanced Cycle Payment Summary

Update `DailyPaymentStatus.tsx` to add a financial summary section:

```
┌──────────────────────────────────────────────────────┐
│ Cycle #N Financial Summary                           │
├──────────────────────────────────────────────────────┤
│ Total Expected:     KES 500 (5 × KES 100)           │
│ Total Collected:    KES 400                          │
│ Late Penalties:     KES 10 (10% on KES 100)         │
│ Unpaid Members:     1 (Member X)                    │
│ Payout Amount:      KES 400 (net, after commission) │
└──────────────────────────────────────────────────────┘
```

This summary will be displayed above the member payment list in the cycle status card.

---

## Files to Be Changed

| File | Changes |
|---|---|
| `supabase/functions/contributions-crud/index.ts` | Cutoff 20→22, fix isLate detection per cycle, stop routing late payments to carry-forward |
| `supabase/functions/daily-cycle-manager/index.ts` | Daily cycle end time 23:59→22:00, cutoff_time '22:00:00' |
| `supabase/functions/cycle-auto-create/index.ts` | Daily cycle end time 23:59→22:00 |
| `supabase/functions/daily-payout-cron/index.ts` | Update payout collection to explicitly isolate member payments, add penalty tracking |
| `src/components/chama/PaymentCountdownTimer.tsx` | cutoffHour default 20→22, all "8:00 PM" text → "10:00 PM" |
| `src/components/chama/DailyPaymentStatus.tsx` | Cutoff hour 20→22, add financial summary panel |

---

## Key Design Decisions

1. **Daily cycle end time = 22:00** — This is the simplest solution to trigger the cron at 10 PM. The cycle ends at 10 PM, the cron picks it up, releases payout.

2. **Late payments count for THIS cycle** — After 10 PM, members can still pay with 10% penalty, and it counts for the current cycle. No more "carry-forward on late" behavior for current cycle.

3. **No cross-member subsidy** — The payout amount is strictly `sum(each_member's_own_payment)`. An overpaying member's extra goes to their own carry-forward for next cycle.

4. **Audit trail** — All commissions (5% on-time, 10% late) already go to `company_earnings` and `financial_ledger`. The cycle record will show `total_collected_amount`, `members_paid_count`, and `members_skipped_count` for transparency.
