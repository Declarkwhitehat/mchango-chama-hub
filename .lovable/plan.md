

# Chama Financial System Audit and Fix Plan

## Root Cause Analysis

After investigating the database and code, here are the confirmed issues with the "Declark chacha DOC (testing)" chama:

### Issue 1: Double-counting of chama financial totals (KES 475 vs expected ~190)

**Root cause**: When a member pays, the chama's `total_gross_collected` and `available_balance` are updated in **two separate places** simultaneously:

1. **`payment-stk-callback`** (lines 131-139): Updates chama financials when M-Pesa callback arrives for online payments
2. **`contributions-crud`** `settleDebts()` (lines 518-532): Also updates chama financials when the contribution is processed

For online payments, **both** fire, causing the amount to be counted **twice**. The offline C2B path (`c2b-confirm-payment`) similarly updates chama financials directly, but then contributions-crud's `settleDebts` also runs, doubling again.

**Evidence**: Database shows `total_gross_collected = 500` and `available_balance = 475` for only 5 completed contributions of KES 100 each (gross = 300 real since 1 failed + 2 accounts = 300 completed for current cycle members). The ledger has 5 entries at KES 100 gross each = KES 500 gross, but real deposits are only KES 300 from the 2 active members (d0e85768 paid 3x100=300, c59ef836 paid 2x100=200 = total 500 gross in contributions table but the chama financial tracking doubled some).

### Issue 2: `member_cycle_payments` records NOT updated by payments

**Root cause**: The `settleDebts()` function in `contributions-crud` looks for the current cycle using date range (`start_date <= today AND end_date >= today`). The cycle's `start_date` is `2026-03-07 18:01:38.376` and `end_date` is `2026-03-07 23:59:59.999`. However the date comparison uses `today = now.toISOString().split('T')[0]` which gives `2026-03-07`. The `lte('start_date', today)` check compares a timestamp against a date string — this might work, but the real problem is that `c2b-confirm-payment` and `payment-stk-callback` **never update `member_cycle_payments`** at all. They update `chama` totals and `chama_members` balance but skip the cycle payment tracking entirely. So all 5 member_cycle_payments records remain `amount_paid: 0, fully_paid: false`.

### Issue 3: Outstanding balance / missed payments shown incorrectly

**Root cause**: Since `member_cycle_payments` never gets updated (Issue 2), the `daily-cycle-manager` action `all-cycles` returns all cycles as `status: 'missed'` for members who actually paid. The MemberDashboard and PaymentStatusManager both read these records to determine paid/unpaid status.

### Issue 4: Blank payment records

**Root cause**: Some contribution records have `payment_notes: null` and no mpesa_receipt_number stored on the contribution record itself — only the STK checkout request ID is stored as `payment_reference`. The M-Pesa receipt number is only updated on the contribution in `payment-stk-callback`, but the payment_notes field is never populated for online payments.

### Issue 5: Withdrawal button should not exist — payouts should be automatic

**Root cause**: The current design includes a manual `WithdrawalButton` component in `ChamaDetail.tsx` (lines 571-632). Per the user's requirement, the system should automatically determine who gets paid each cycle and send funds without manual withdrawal requests.

---

## Fix Plan

### 1. Eliminate double financial tracking (Critical)

**Files**: `supabase/functions/contributions-crud/index.ts`, `supabase/functions/payment-stk-callback/index.ts`, `supabase/functions/c2b-confirm-payment/index.ts`

- Remove the chama financial update (`total_gross_collected`, `total_commission_paid`, `available_balance`) from **`payment-stk-callback`** and **`c2b-confirm-payment`**. These should be handled **only** in `contributions-crud`'s `settleDebts()` which is the authoritative FIFO allocation engine.
- Alternatively (simpler): Remove the `settleDebts` financial update and keep it only in the callbacks. The key is: **exactly one place updates chama financials per payment**.
- **Chosen approach**: Keep financial tracking in `contributions-crud` `settleDebts()` only, since it does proper FIFO allocation. Remove from `payment-stk-callback` and `c2b-confirm-payment`.

### 2. Fix `member_cycle_payments` updates (Critical)

**Files**: `supabase/functions/payment-stk-callback/index.ts`, `supabase/functions/c2b-confirm-payment/index.ts`

- After recording the contribution and before returning, invoke `settleDebts()` from `contributions-crud` or replicate the cycle payment update logic so that `member_cycle_payments` records are properly updated.
- **Better approach**: Since `contributions-crud` already handles FIFO settlement, ensure that both `payment-stk-callback` and `c2b-confirm-payment` call into `contributions-crud` (via supabase.functions.invoke) instead of doing their own financial tracking. This creates a single code path for all payment processing.
- **Simplest approach**: After the callback records the contribution in `c2b-confirm-payment` and `payment-stk-callback`, have them invoke `contributions-crud` with the contribution details so `settleDebts()` runs and updates `member_cycle_payments`. But this creates a circular dependency since contributions-crud creates the contribution record.
- **Final approach**: Extract the `settleDebts` logic into a shared function call. After each callback creates the contribution, invoke the debt settlement function directly by calling `contributions-crud` with an `action: 'settle'` body that only runs the settlement without re-inserting the contribution.

### 3. Ensure all payment records have complete data

**Files**: `supabase/functions/payment-stk-callback/index.ts`, `supabase/functions/c2b-confirm-payment/index.ts`

- When updating contributions on callback, store `mpesa_receipt_number`, `payment_notes` with payer details, and ensure no blank records exist.
- Add a `payment_method` field to track whether payment was online STK or offline C2B.

### 4. Remove manual Withdrawal section from ChamaDetail

**File**: `src/pages/ChamaDetail.tsx`

- Remove the entire "Withdrawal Status" card (lines 571-632) that shows the `WithdrawalButton`.
- The automatic payout logic already exists in `contributions-crud` and `c2b-confirm-payment` — when all members pay, the system auto-creates a withdrawal and triggers B2C payout. This is the correct behavior.

### 5. Fix Total Collected display on ChamaDetail

**File**: `src/pages/ChamaDetail.tsx`

- The `totalContributions` calculation (lines 200-230) currently shows `available_balance - total_withdrawn`. This is confusing because "Total Collected" should show the net amount collected for the current cycle, not the overall available balance.
- Change the "Total Collected" card to show the actual net pool balance: `available_balance` (which already accounts for commission and withdrawals).

### 6. Data correction for test chama

- Run a data fix to recalculate the correct `total_gross_collected`, `total_commission_paid`, and `available_balance` from actual completed contributions.
- Update `member_cycle_payments` for the existing cycle to reflect actual payments made.

### 7. Add financial integrity safeguards

**File**: `supabase/functions/contributions-crud/index.ts`

- Add idempotency check before `settleDebts()` to prevent double processing.
- Log any discrepancy between expected and actual totals.
- Ensure `settleDebts()` is the single source of truth for all financial allocation.

---

## Summary of Files to Edit

| File | Changes |
|---|---|
| `supabase/functions/payment-stk-callback/index.ts` | Remove chama financial tracking, delegate to contributions-crud settlement |
| `supabase/functions/c2b-confirm-payment/index.ts` | Remove chama financial tracking, delegate to contributions-crud settlement |
| `supabase/functions/contributions-crud/index.ts` | Add `action: 'settle-only'` endpoint for callbacks, add integrity checks |
| `src/pages/ChamaDetail.tsx` | Remove WithdrawalButton/Withdrawal Status section, fix Total Collected display |
| Database data fix | Recalculate chama financials, update member_cycle_payments |

