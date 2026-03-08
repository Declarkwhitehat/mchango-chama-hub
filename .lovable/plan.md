

## Diagnosis

The withdrawal `0c616645` (KES 15) for the vibechasers account is stuck in `pending_retry` because:

1. **B2C was initiated successfully** — ConversationID `AG_20260302_010015490foxbxdva8mf` was assigned, meaning Safaricom accepted and sent the money
2. **Callback never arrived** — the `b2c-callback` function has zero logs, meaning Safaricom's result callback is not reaching the endpoint
3. **Retry system re-sent B2C** — the retry function tried to send the money again, which failed with ResultCode 25 ("parameter format null"), putting it in `pending_retry`
4. **User is now blocked** — the concurrent withdrawal check sees the `pending_retry` record and blocks new withdrawal requests with a 400 error

There are 3 total stuck withdrawals across the system with the same pattern.

## Root Cause

The `retry-failed-payouts` function blindly retries B2C for `pending_retry` withdrawals without checking if the original B2C already succeeded. It should first query Safaricom's Transaction Status API before attempting a new B2C.

## Fix Plan

### 1. Manually complete stuck withdrawal via RPC
Call `process_withdrawal_completion` for withdrawal `0c616645` (KES 15) to mark it completed and deduct from the mchango balance. The ConversationID serves as the receipt since the callback never arrived.

Also complete `e2ea0312` (KES 10) which has the same pattern.

### 2. Fix retry-failed-payouts to query status before re-sending
Change the retry logic: for withdrawals that already have a ConversationID in their notes (meaning B2C was previously initiated), call `b2c-status-query` first instead of blindly re-triggering `b2c-payout`. Only re-send if the status query confirms the original failed.

### 3. Add a "check status" path in withdrawals-crud
Add a PATCH handler so users can trigger a status check on their stuck `pending_retry` or `processing` withdrawals from the UI, rather than waiting for the cron.

### Files to Change
- **`supabase/functions/retry-failed-payouts/index.ts`**: Add status-query-first logic for withdrawals with existing ConversationIDs
- **`supabase/functions/withdrawals-crud/index.ts`**: Add PATCH handler for manual status check
- **Manual DB fix**: Complete the 2-3 stuck withdrawals via RPC

