

## Problem: Double-Counting Welfare Contributions

When a member pays via M-Pesa STK Push, the welfare balance is updated **twice**:

1. **C2B Callback** (`c2b-confirm-payment`): Safaricom sends payment confirmation → updates `welfares` balance (+24.7 net)
2. **Frontend polling** (`welfare-contributions` POST): After STK query confirms success, the frontend calls `welfare-contributions` → updates `welfares` balance (+24.7 net) **again**

Your math confirms this: 84 + 24.7 + 24.7 = **133.4** (the exact incorrect balance shown).

The contribution record is also likely duplicated in `welfare_contributions` table.

## Fix

**File: `src/components/welfare/WelfareContributionForm.tsx`**

After STK query confirms payment success (ResultCode 0), the frontend should **NOT** call `welfare-contributions` POST. The C2B callback already handles recording the contribution and updating balances. The frontend should just show success and refresh.

Remove the two blocks (initial check ~line 88-98 and poll ~line 130-140) where `welfare-contributions` POST is called after successful STK payment. Keep only the success UI feedback and `onContributed()` refresh call.

**File: `supabase/functions/welfare-contributions/index.ts`** (optional hardening)

Add a duplicate check: before inserting a contribution, verify no existing contribution with the same `payment_reference` / `mpesa_receipt_number` exists for this welfare. If found, return the existing record instead of inserting again.

## Summary of Changes

1. **WelfareContributionForm.tsx**: Remove duplicate `welfare-contributions` POST calls after STK success — the C2B callback already handles everything
2. **welfare-contributions/index.ts**: Add idempotency guard to prevent duplicate contributions with the same payment reference

