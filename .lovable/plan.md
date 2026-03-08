

## Problem

The `welfare-withdrawal-approve` edge function's GET endpoint crashes with error:
```
Could not find a relationship between 'withdrawals' and 'requested_by' in the schema cache
```

This happens because the query on line 175 attempts a PostgREST embedded join (`profiles:requested_by(full_name, phone)`) but there is **no foreign key** from `withdrawals.requested_by` to `profiles.id`. The function returns a 500 error, so the frontend always shows "No pending approvals."

The approval records DO exist in the database (confirmed: 4 pending approval records for this welfare group).

## Solution

Two options:

**Option A (recommended)**: Fix the edge function query to avoid the embedded join. Instead, fetch approvals without the profile join, then separately look up requester names.

**Option B**: Add a FK from `withdrawals.requested_by` to `profiles.id` via migration. This is riskier since `requested_by` references `auth.users` and adding a FK to `profiles` could cause insert failures if the profile doesn't exist yet.

### Plan — Option A

**File: `supabase/functions/welfare-withdrawal-approve/index.ts`**

Change the GET query (line 173-178) from:
```typescript
.select('*, withdrawals!withdrawal_id(amount, net_amount, status, notes, requested_at, profiles:requested_by(full_name, phone)), welfares!welfare_id(name)')
```
To:
```typescript
.select('*, withdrawals!withdrawal_id(amount, net_amount, status, notes, requested_at, requested_by), welfares!welfare_id(name)')
```

Then after fetching, do a separate lookup for each unique `requested_by` user ID against the `profiles` table to get `full_name` and `phone`, and attach the profile info to each approval record before returning.

This avoids the FK dependency entirely while still providing requester info to the frontend.

