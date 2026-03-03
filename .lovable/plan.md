

## Withdrawal Bug Fix Plan

### Root Cause Analysis

I examined the live data and found:
- **Multiple withdrawals stuck in "processing"** — money was sent via M-Pesa but the callback never updated the status
- **b2c-callback has zero logs** — Safaricom's callback is either not reaching the function or silently failing
- The current code deducts balance immediately in `withdrawals-crud`, but since status never updates to "completed", the UI still shows old balance and the system appears broken
- The blocking-withdrawal check uses the RLS-scoped client, which may not see all withdrawals correctly

### What I Will Fix

**1. Create an atomic database function for balance deduction**
- A `SECURITY DEFINER` PL/pgSQL function `process_withdrawal_completion(p_withdrawal_id, p_mpesa_receipt, p_amount)` that:
  - Checks withdrawal isn't already completed (idempotency)
  - Updates withdrawal status to 'completed' with receipt
  - Deducts balance from the correct entity (mchango/chama/org/welfare)
  - Ensures balance can't go negative
  - All within a single DB transaction (atomic)

**2. Remove immediate balance deduction from `withdrawals-crud`**
- Remove lines 428–496 that deduct balance at withdrawal creation
- Balance will only be deducted on confirmed callback success

**3. Rewrite `b2c-callback` to use the atomic function**
- Call `process_withdrawal_completion()` RPC on success
- Add idempotency: skip if withdrawal already completed
- Add detailed logging to diagnose why callbacks aren't being received
- On failure: update status to 'failed' or 'pending_retry'

**4. Add B2C transaction status query endpoint**
- New function `b2c-status-query` that polls Safaricom's Transaction Status API
- This is the fallback for when callbacks don't arrive
- Can be called from the frontend to manually check and complete stuck transactions

**5. Fix concurrent withdrawal prevention**
- Switch the blocking-withdrawal query in `withdrawals-crud` to use `supabaseAdmin` instead of `supabaseClient` to bypass RLS and reliably detect existing in-progress withdrawals

**6. Add manual completion endpoint**
- A `PATCH` handler in `withdrawals-crud` that allows the creator to trigger a status check for stuck "processing" withdrawals, calling the B2C status query

### Technical Details

```text
FLOW (CURRENT - BROKEN):
  User requests → Balance deducted immediately → B2C sent → Callback never arrives
  Result: Balance reduced but status stays "processing"

FLOW (FIXED):
  User requests → Status = "processing" (no balance change) → B2C sent
    ↓ Callback arrives (success) → Atomic: status=completed + balance deducted
    ↓ Callback arrives (failure) → status=failed, no deduction
    ↓ No callback? → User/cron polls B2C status query → completes if confirmed
```

**DB Function signature:**
```sql
CREATE FUNCTION process_withdrawal_completion(
  p_withdrawal_id UUID,
  p_mpesa_receipt TEXT,
  p_transaction_amount NUMERIC
) RETURNS JSONB
```

This ensures status update + balance deduction are a single atomic operation, preventing partial updates and double-spending.

### Files to Change
- **New migration**: `process_withdrawal_completion` DB function
- **`supabase/functions/withdrawals-crud/index.ts`**: Remove immediate deduction, fix blocking query
- **`supabase/functions/b2c-callback/index.ts`**: Use atomic RPC, add idempotency + logging
- **New `supabase/functions/b2c-status-query/index.ts`**: Polling fallback for stuck transactions

