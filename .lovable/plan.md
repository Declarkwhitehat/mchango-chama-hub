

# Fix Double Payment Recording and Cycle Scheduling

## Root Cause Analysis

### Why CTAHM0008 (rediciah kemunto) shows KES 200 instead of KES 100

The same M-Pesa transaction (receipt `UC8IT8LHWC`) created **two** contribution records:

1. **STK record** (`28b62e5c`): Created by `payment-stk-push` as pending, updated to completed by `payment-stk-callback`. Stored `payment_reference = ws_CO_08032026095919...` (CheckoutRequestID) and `mpesa_receipt_number = UC8IT8LHWC`.

2. **C2B record** (`5f6d72ae`): Created by `c2b-confirm-payment` when the same M-Pesa payment also triggered the C2B callback. Stored `payment_reference = UC8IT8LHWC`.

**The duplicate check in `c2b-confirm-payment` (line 62) only checks `contributions.payment_reference`**, but the STK record uses the CheckoutRequestID (`ws_CO_...`) as `payment_reference`, NOT the receipt number. So C2B doesn't detect the existing STK record as a duplicate.

Both callbacks then call `settle-only`, doubling the chama financial totals.

### Why the idempotency check in settle-only doesn't work

The settle-only code checks `financial_ledger.reference_id = contribution_id`, but the `settleDebts()` function inserts into `financial_ledger` WITHOUT setting `reference_id` (line 534). So the idempotency check never matches anything.

### Why cycle 2 hasn't been created

Cycle 1 (Mar 7) has only 2 of 5 members paid. The system waits for all members to pay before completing the cycle and creating the next one. For a daily chama, the cycle auto-creation should trigger when the cycle's end_date passes, but this requires the `daily-payout-cron` or similar to run.

---

## Fix Plan

### 1. Fix C2B duplicate detection (Critical - prevents future doubles)

**File**: `supabase/functions/c2b-confirm-payment/index.ts`

Add an additional check for `mpesa_receipt_number` column on the contributions table alongside the existing `payment_reference` check:

```typescript
// Existing check (line 62) - also check mpesa_receipt_number column
const { data: existingByReceipt } = await supabase
  .from('contributions')
  .select('id')
  .eq('mpesa_receipt_number', mpesaReceiptNumber)
  .maybeSingle();

if (existingContribution || existingByReceipt || existingDeposit || ...) {
  // Duplicate detected
}
```

### 2. Fix financial_ledger idempotency (Critical)

**File**: `supabase/functions/contributions-crud/index.ts`

- Add `contributionId` parameter to `settleDebts()` function
- Set `reference_id: contributionId` on the `financial_ledger` insert (line 534)
- This makes the settle-only idempotency check at line 600 actually work

### 3. Fix chama totals recalculation from actual data (Data fix)

Use the insert tool to:
- Find all duplicate contributions across ALL chamas where the same `mpesa_receipt_number` appears in both a `payment_reference` and an `mpesa_receipt_number` of different records
- Delete the C2B duplicates (keep the STK originals)
- Recalculate `total_gross_collected`, `total_commission_paid`, `available_balance` for affected chamas from their actual unique completed contributions
- Fix `member_cycle_payments` records to reflect actual payments
- Fix `carry_forward_credit` for member CTAHM0008 (currently shows 95 from the double-counted settlement)

### 4. Fix cycle beneficiary dates display

The chama started Mar 7 with daily frequency. Per the user:
- Cycle 1 (Mar 7): beneficiary = member #1 (Vibe chaser) -- correct in DB
- Cycle 2 (Mar 8): beneficiary = member #2 (Macot) -- needs to be created

Cycle 2 hasn't been auto-created because cycle 1 isn't complete (3 of 5 members haven't paid). The `cycle-auto-create` function only runs after a cycle completes. For daily chamas, the system needs to handle the case where not all members pay -- the cycle should still progress on schedule and mark unpaid members as missed.

**Fix**: Update `daily-payout-cron` or add logic in `daily-cycle-manager` to auto-advance daily cycles at the end_date regardless of payment completion, processing available payouts and marking non-payers as missed.

### 5. Prevent STK+C2B double-fire at the callback level

**File**: `supabase/functions/payment-stk-callback/index.ts`

After updating the contribution to completed, also set a consistent `mpesa_receipt_number` that C2B can check:
- Already done (line 77) -- the mpesa_receipt_number IS being stored. The issue is purely C2B not checking it.

---

## Files to Edit

| File | Change |
|---|---|
| `supabase/functions/c2b-confirm-payment/index.ts` | Add `mpesa_receipt_number` to duplicate check for contributions |
| `supabase/functions/contributions-crud/index.ts` | Add `contributionId` param to `settleDebts()`, set `reference_id` on ledger insert |
| Database (insert tool) | Delete duplicate contributions globally, recalculate all affected chama totals |
| `supabase/functions/daily-cycle-manager/index.ts` or `daily-payout-cron` | Auto-advance daily cycles at end_date even if not all members paid |

