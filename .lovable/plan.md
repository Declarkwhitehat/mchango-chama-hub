

## Fix: Withdrawals check constraint blocking welfare withdrawals

### Problem
The `withdrawals` table has a CHECK constraint (`check_chama_or_mchango`) that requires exactly one of `chama_id` or `mchango_id` to be non-null. When welfare (or organization) withdrawals are inserted, both are null, violating the constraint.

### Solution
Drop the old constraint and replace it with one that allows exactly one of the four entity columns (`chama_id`, `mchango_id`, `organization_id`, `welfare_id`) to be set.

### Database Migration
```sql
ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS check_chama_or_mchango;

ALTER TABLE public.withdrawals ADD CONSTRAINT check_entity_source CHECK (
  (
    (chama_id IS NOT NULL)::int +
    (mchango_id IS NOT NULL)::int +
    (organization_id IS NOT NULL)::int +
    (welfare_id IS NOT NULL)::int
  ) = 1
);
```

This is a single migration — no code changes needed since `WelfareWithdrawalRequest.tsx` already correctly sets `welfare_id`.

