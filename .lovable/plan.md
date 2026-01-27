
# B2C Withdrawal Fix Plan

## Overview
This plan addresses critical B2C payout failures by fixing the entire withdrawal flow from request creation through completion. The solution ensures reliable, atomic operations with proper status management and fallback mechanisms.

## Problem Summary
The current B2C withdrawal system has several failure points:
1. Withdrawals get stuck in "approved" status without triggering B2C payouts
2. Callback cannot find withdrawals due to timing issues with `payment_reference`
3. Balance updates are not atomic (potential overdraft risk)
4. Auto-approved withdrawals use fire-and-forget pattern that fails silently
5. No automated recovery for stuck "approved" withdrawals

---

## Technical Implementation

### 1. Fix `mpesa-b2c-payout` Edge Function

**Problem**: The function updates `payment_reference` after B2C success, but callback may arrive before this happens.

**Solution**: Store the conversation ID BEFORE making the B2C API call using `Occasion` field as the lookup key.

**Changes**:
- Store a predictable reference (`WD-{withdrawal_id}`) in `payment_reference` before calling M-Pesa API
- Use this same reference in the `Occasion` field for the B2C request
- Update callback to lookup by either `payment_reference` or extract ID from `Occasion`

```typescript
// Generate predictable reference BEFORE B2C call
const payoutReference = `WD-${withdrawal_id}`;

// Store it immediately
await supabaseAdmin
  .from('withdrawals')
  .update({
    payment_reference: payoutReference,
    status: 'processing',
    b2c_attempt_count: (withdrawal.b2c_attempt_count || 0) + 1,
    last_b2c_attempt_at: new Date().toISOString()
  })
  .eq('id', withdrawal_id);

// Use same reference in B2C payload Occasion field
const b2cPayload = {
  // ... other fields
  Occasion: payoutReference // Use our reference, not ConversationID
};
```

### 2. Fix `mpesa-b2c-callback` Edge Function

**Problem**: Lookup by `ConversationID` fails if the payout update hasn't completed yet.

**Solution**: Add fallback lookup methods.

**Changes**:
- Primary: Lookup by `payment_reference` matching the `Occasion` field
- Fallback: Extract withdrawal ID from `Occasion` (format: `WD-{uuid}`)
- Update `payment_reference` to M-Pesa `TransactionID` on success

```typescript
// Try finding by Occasion first (our reference)
const occasion = result.Occasion || '';
let withdrawal = null;

// Method 1: Direct lookup by payment_reference
const { data: wd1 } = await supabaseAdmin
  .from('withdrawals')
  .select('*')
  .eq('payment_reference', occasion)
  .maybeSingle();

if (wd1) {
  withdrawal = wd1;
} else if (occasion.startsWith('WD-')) {
  // Method 2: Extract ID from Occasion format WD-{uuid}
  const withdrawalId = occasion.substring(3);
  const { data: wd2 } = await supabaseAdmin
    .from('withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .maybeSingle();
  withdrawal = wd2;
}
```

### 3. Fix Auto-Approval Flow in `withdrawals-crud` POST Route

**Problem**: Fire-and-forget pattern fails silently for auto-approved Mchango withdrawals.

**Solution**: Await the B2C call and handle failures properly.

**Changes** (lines 401-436):
```typescript
if (canAutoApprove && defaultPaymentMethod.phone_number) {
  const payoutRes = await fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      withdrawal_id: withdrawal.id,
      phone_number: defaultPaymentMethod.phone_number,
      amount: netAmount
    })
  });

  const payoutResult = await payoutRes.json();
  
  if (!payoutRes.ok || !payoutResult.success) {
    // Mark withdrawal as failed for retry
    await supabaseClient
      .from('withdrawals')
      .update({
        status: 'pending_retry',
        b2c_error_details: payoutResult.error || 'Initiation failed'
      })
      .eq('id', withdrawal.id);
  }
}
```

### 4. Add Stuck Withdrawal Recovery in `retry-failed-payouts`

**Problem**: Withdrawals stuck in "approved" for more than 1 hour are never retried.

**Solution**: Include "approved" status in retry logic.

**Changes**:
```typescript
// Also handle stuck "approved" withdrawals (B2C never triggered)
const stuckApprovedThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour

const { data: stuckApproved } = await supabase
  .from('withdrawals')
  .select('*')
  .eq('status', 'approved')
  .or(`last_b2c_attempt_at.is.null,last_b2c_attempt_at.lt.${stuckApprovedThreshold}`)
  .eq('b2c_attempt_count', 0);

for (const stuck of stuckApproved || []) {
  // Mark for retry so normal retry flow picks it up
  await supabase
    .from('withdrawals')
    .update({
      status: 'pending_retry',
      notes: (stuck.notes || '') + `\n[SYSTEM] Stuck approved withdrawal recovered at ${new Date().toISOString()}`
    })
    .eq('id', stuck.id);
}
```

### 5. Add Balance Locking for Atomic Operations

**Problem**: Race conditions can cause balance issues.

**Solution**: Use Postgres row-level locking with `FOR UPDATE`.

**Database Migration**:
```sql
-- Create function for atomic balance check and lock
CREATE OR REPLACE FUNCTION public.check_and_lock_withdrawal_balance(
  p_chama_id UUID DEFAULT NULL,
  p_mchango_id UUID DEFAULT NULL,
  p_amount NUMERIC
)
RETURNS TABLE(
  can_withdraw BOOLEAN,
  available_balance NUMERIC,
  entity_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_chama_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      (c.available_balance - COALESCE(c.total_withdrawn, 0) >= p_amount) as can_withdraw,
      (c.available_balance - COALESCE(c.total_withdrawn, 0)) as available_balance,
      c.name as entity_name
    FROM chama c
    WHERE c.id = p_chama_id
    FOR UPDATE OF c;
  ELSIF p_mchango_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      (m.available_balance >= p_amount) as can_withdraw,
      m.available_balance,
      m.title as entity_name
    FROM mchango m
    WHERE m.id = p_mchango_id
    FOR UPDATE OF m;
  END IF;
END;
$$;
```

### 6. Update Balance Atomically on Completion

**Location**: `mpesa-b2c-callback` - ensure balance updates happen in the success handler.

**Changes**:
```typescript
// On B2C success - update both chama and mchango balances atomically
if (withdrawal.chama_id) {
  await supabaseAdmin.rpc('update_chama_withdrawn', {
    p_chama_id: withdrawal.chama_id,
    p_amount: transactionAmount
  });
}

if (withdrawal.mchango_id) {
  await supabaseAdmin.rpc('update_mchango_withdrawn', {
    p_mchango_id: withdrawal.mchango_id,
    p_amount: transactionAmount
  });
}
```

**Database Functions**:
```sql
CREATE OR REPLACE FUNCTION public.update_chama_withdrawn(
  p_chama_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE chama
  SET total_withdrawn = COALESCE(total_withdrawn, 0) + p_amount
  WHERE id = p_chama_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_mchango_withdrawn(
  p_mchango_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE mchango
  SET 
    current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_amount),
    available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount)
  WHERE id = p_mchango_id;
END;
$$;
```

---

## Files to Modify

1. **`supabase/functions/mpesa-b2c-payout/index.ts`**
   - Store predictable reference before B2C call
   - Update status to "processing" before API call
   - Improve error handling

2. **`supabase/functions/mpesa-b2c-callback/index.ts`**
   - Add fallback withdrawal lookup methods
   - Update payment_reference on success
   - Handle edge cases for missing withdrawals

3. **`supabase/functions/withdrawals-crud/index.ts`**
   - Await B2C call in auto-approval flow
   - Add proper error handling for failed initiations
   - Use atomic balance check function

4. **`supabase/functions/retry-failed-payouts/index.ts`**
   - Include stuck "approved" withdrawals in recovery
   - Add stalled processing detection

5. **Database Migration** (new)
   - Create `check_and_lock_withdrawal_balance` function
   - Create `update_chama_withdrawn` function
   - Create `update_mchango_withdrawn` function

---

## Status Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                     WITHDRAWAL STATUS FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User Request                                                   │
│        │                                                         │
│        ▼                                                         │
│   ┌─────────┐  (Chama/Non-M-Pesa)  ┌──────────────┐             │
│   │ PENDING │ ────────────────────▶│ Admin Review │             │
│   └────┬────┘                       └──────┬───────┘             │
│        │ (Mchango + M-Pesa)                │                     │
│        │ Auto-approve                       │ Approve             │
│        ▼                                    ▼                     │
│   ┌──────────┐                        ┌──────────┐               │
│   │ APPROVED │ ◄──────────────────────┤ APPROVED │               │
│   └────┬─────┘                        └────┬─────┘               │
│        │ Trigger B2C                       │ Admin clicks        │
│        │                                   │ "Send via M-Pesa"   │
│        ▼                                   ▼                     │
│   ┌────────────┐                     ┌────────────┐              │
│   │ PROCESSING │ ◄───────────────────┤ PROCESSING │              │
│   └──────┬─────┘                     └──────┬─────┘              │
│          │                                  │                     │
│          ├────────────────┬─────────────────┤                     │
│          │                │                 │                     │
│          ▼                ▼                 ▼                     │
│   ┌───────────┐    ┌──────────────┐   ┌────────┐                 │
│   │ COMPLETED │    │ PENDING_RETRY│   │ FAILED │                 │
│   └───────────┘    └──────┬───────┘   └────────┘                 │
│                           │                                       │
│                           │ Retry cron (max 3 attempts)          │
│                           ▼                                       │
│                    ┌────────────┐                                 │
│                    │ PROCESSING │ ───▶ COMPLETED / FAILED         │
│                    └────────────┘                                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

After implementation:
1. Create a Mchango withdrawal as creator with M-Pesa - should auto-approve and process
2. Create a Chama withdrawal - should require admin approval
3. Admin approves Chama withdrawal via "Send via M-Pesa" - should trigger B2C
4. Simulate B2C failure - should mark as `pending_retry`
5. Run retry-failed-payouts cron - should attempt retry
6. Verify balances update correctly after completion
7. Verify stuck "approved" withdrawals are recovered

---

## Expected Outcomes

- All withdrawals progress through the correct status flow
- B2C payouts are reliably triggered and tracked
- Callbacks successfully find and update withdrawals
- Failed payouts are automatically retried up to 3 times
- Stuck withdrawals are recovered automatically
- Balances remain consistent with proper locking
- Full audit trail maintained in notes field
