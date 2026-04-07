

## Plan: Fix GJ5X3Q8S Payout and Clean Up Payment Methods

### Root Cause
Sabastian's default payment method is **Airtel Money** (+254783768798), not M-Pesa. The auto-payout logic requires `method_type === 'mpesa'` to auto-approve. Since his default is Airtel, the withdrawal was created as `pending` (requiring admin approval) instead of `approved`, and no B2C was triggered.

He also has 3 payment method records — 2 duplicates with a non-Safaricom number and 1 Airtel Money entry set as default. None use his actual Safaricom profile number (+254794944611).

### Steps

#### 1. Clean up payment methods (database migration)
- Delete the 3 incorrect/duplicate payment method records for this user
- Create a single correct M-Pesa payment method using his profile Safaricom number (+254794944611) and set it as default + verified

#### 2. Trigger the pending payout
- Update withdrawal `b3b09c85` status from `pending` to `approved` so the B2C payout can be triggered
- Trigger the B2C payout to send KES 190 to his Safaricom number +254794944611

#### 3. Prevent recurrence (code fix)
- In `daily-payout-cron`, when no M-Pesa default payment method is found, fall back to the user's **profile phone number** (which is guaranteed Safaricom per the platform policy) instead of blocking the auto-payout entirely
- This ensures payouts aren't silently stuck as "pending" when payment methods are misconfigured

### Technical Details
- **Migration SQL**: DELETE from `payment_methods` WHERE `user_id = '7d43b338-...'`; INSERT correct M-Pesa record
- **Edge function edit**: `daily-payout-cron/index.ts` lines ~868-882 — add fallback to `profiles.phone` when no M-Pesa default payment method exists
- **Manual B2C trigger**: Call the `b2c-payout` edge function with withdrawal_id, phone +254794944611, amount 190

