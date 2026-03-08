

## Problem

The welfare withdrawal request fails with: **"new row for relation 'withdrawals' violates check constraint 'withdrawals_status_check'"**.

The code in `WelfareWithdrawalRequest.tsx` inserts a withdrawal with status `'pending_approval'`, but the database constraint only allows: `pending`, `approved`, `rejected`, `completed`, `processing`, `failed`, `pending_retry`.

## Solution

Two changes needed:

1. **Database migration**: Add `'pending_approval'` to the `withdrawals_status_check` constraint so welfare's multi-sig approval workflow is supported.

2. **No code changes needed** — the component logic is correct; it's just the DB constraint blocking it.

### Migration SQL
```sql
ALTER TABLE public.withdrawals DROP CONSTRAINT withdrawals_status_check;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_status_check 
  CHECK (status = ANY (ARRAY[
    'pending', 'approved', 'rejected', 'completed', 
    'processing', 'failed', 'pending_retry', 'pending_approval'
  ]));
```

This is a single, focused fix that unblocks welfare withdrawal submissions.

