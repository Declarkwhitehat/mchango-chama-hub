

## Problem

The Admin Transactions page shows "No transactions found" because the `transactions` table has **0 rows**. Real payments exist in `welfare_contributions` (3), `organization_donations` (15), etc., but nothing is inserted into `transactions`.

Additionally, `transactions.user_id` has **no foreign key** to `profiles.id`, so the embedded join `profiles(full_name, email, phone)` would fail even if data existed.

## Root Cause

The platform processes payments through STK Push → C2B callback, which writes to entity-specific tables (`welfare_contributions`, `organization_donations`, `contributions`, `chama_contributions`) but never writes to the central `transactions` table.

## Plan

### 1. Add foreign key from `transactions.user_id` to `profiles.id`

Database migration:
```sql
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);
```

This enables the embedded PostgREST join used in `TransactionsTable.tsx`.

### 2. Rewrite TransactionsTable to query actual payment data

Since populating a separate `transactions` table would require modifying every payment flow, the faster and more reliable fix is to **query the real payment tables directly** via an edge function.

**New approach in `TransactionsTable.tsx`**: Call a new admin edge function that unions data from:
- `welfare_contributions` (with welfare name, user info)
- `organization_donations` (with org name, donor info)
- `contributions` (chama contributions with member/chama info)

This gives the admin a unified view of all platform financial activity without needing a separate table.

### 3. Create `admin-transactions` edge function

A new edge function that:
- Verifies admin role (service role client)
- Queries all payment tables with relevant joins
- Returns a unified, sorted list with pagination
- Supports search filtering server-side

### 4. Update TransactionsTable component

- Replace the direct Supabase client query with `supabase.functions.invoke('admin-transactions')`
- Map the unified response to the existing table columns
- Add a "Source" column (Welfare / Organization / Chama / Mchango) for clarity
- Keep existing search, export, and navigation features

## Summary

Two changes: (1) new admin edge function that unions all payment tables into a single response, (2) updated `TransactionsTable` component to call it. This gives a working admin transactions view using real data instead of an empty table.

