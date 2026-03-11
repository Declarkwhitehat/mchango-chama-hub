

## Plan: Fix Double-Payment Bug and Harden Financial Idempotency

### Root Cause Analysis

I identified **4 critical bugs** causing the KES 200 instead of KES 100 issue:

#### Bug 1: STK Callback has NO idempotency guard
`payment-stk-callback/index.ts` (line 53-127) — When M-Pesa sends the same callback twice (which happens frequently under network issues), the function:
1. Finds the contribution by `payment_reference = checkoutRequestId`
2. Updates its status to `completed`
3. Calls `contributions-crud settle-only` again

The `settle-only` endpoint does check `financial_ledger` for an existing `reference_id` (line 679-694), but this is a **race condition** — two simultaneous callbacks can both pass this check before either writes. Also, the contribution status update itself has no guard against processing a contribution that's already `completed`.

#### Bug 2: No unique constraint on `contributions.payment_reference`
The `contributions` table has no unique constraint on `payment_reference` or `mpesa_receipt_number`, so duplicate inserts can succeed. The `mchango_donations` table has `payment_reference TEXT UNIQUE` but `contributions` does not.

#### Bug 3: C2B callback creates a NEW contribution row AND triggers settle-only
`c2b-confirm-payment/index.ts` (lines 124-167) — For chama C2B payments, it inserts a new `contributions` row with `payment_reference = mpesaReceiptNumber`, then calls `settle-only`. If M-Pesa sends the callback twice, the duplicate check on line 55-83 should catch it — but only if the first insert completed before the second check runs (race condition on concurrent callbacks).

#### Bug 4: "Pay for another member" — no double-processing guard
When member A pays for member B via STK push, `payment-stk-push` creates a `contributions` record with `paid_by_member_id = A` and `member_id = B`. The callback then settles debt for member B. There's no issue with the logic itself, but the lack of idempotency means the same callback processed twice doubles the settlement.

---

### Implementation Plan

#### 1. Database Migration — Unique Constraints + Settlement Lock Table

```sql
-- Unique constraint on contributions.payment_reference (prevent duplicate inserts)
CREATE UNIQUE INDEX IF NOT EXISTS unique_contributions_payment_ref 
  ON public.contributions(payment_reference) WHERE payment_reference IS NOT NULL;

-- Unique constraint on contributions.mpesa_receipt_number
CREATE UNIQUE INDEX IF NOT EXISTS unique_contributions_mpesa_receipt 
  ON public.contributions(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;

-- Unique constraint on welfare_contributions.payment_reference
CREATE UNIQUE INDEX IF NOT EXISTS unique_welfare_contrib_payment_ref 
  ON public.welfare_contributions(payment_reference) WHERE payment_reference IS NOT NULL;

-- Settlement lock table for atomic idempotency
CREATE TABLE IF NOT EXISTS public.settlement_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid UNIQUE NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  settlement_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settlement_locks ENABLE ROW LEVEL SECURITY;

-- Reconciliation anomalies log table
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  expected_value numeric,
  actual_value numeric,
  difference numeric,
  details jsonb,
  auto_corrected boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view reconciliation logs" ON public.reconciliation_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
```

#### 2. Fix `payment-stk-callback/index.ts` — Add Idempotency Guard

Before processing any chama contribution callback, add:
- **Status guard**: If `contribution.status === 'completed'`, return immediately (already processed)
- **Receipt dedup**: Check if `mpesa_receipt_number` already exists on any contribution before proceeding
- Same guards for mchango/organization donation sections

#### 3. Fix `contributions-crud/index.ts` settle-only — Atomic Lock

Replace the `financial_ledger` check with an atomic `settlement_locks` insert:
```typescript
// Atomic idempotency: try to claim the settlement
const { error: lockError } = await supabaseAdmin
  .from('settlement_locks')
  .insert({ contribution_id });

if (lockError?.code === '23505') {
  // Unique violation = already settled
  return Response(JSON.stringify({ success: true, already_settled: true }));
}
```
This eliminates the race condition entirely because the unique constraint on `contribution_id` is enforced atomically by the database.

#### 4. Fix `c2b-confirm-payment/index.ts` — Strengthen Duplicate Guard

The existing duplicate check is good but has a race window. Add:
- Use `INSERT ... ON CONFLICT DO NOTHING` pattern via the unique constraint on `payment_reference`
- If the insert returns no rows, it's a duplicate — return immediately

#### 5. Create Reconciliation Edge Function

New edge function `supabase/functions/financial-reconciliation/index.ts`:
- Runs on a cron schedule (every 6 hours)
- Recalculates chama `available_balance` from `contributions` + `withdrawals` + `company_earnings`
- Detects duplicate `mpesa_receipt_number` values across tables
- Detects contributions where amount exceeds expected `contribution_amount` 
- Logs anomalies to `reconciliation_logs` table
- Auto-corrects balance drift if detected

#### 6. Add Reconciliation Cron Job

Schedule via `pg_cron`:
```sql
SELECT cron.schedule(
  'financial-reconciliation-6hr',
  '0 */6 * * *',
  $$ SELECT net.http_post(...) $$
);
```

### Files Changed

| File | Change |
|------|--------|
| **New migration** | Unique constraints + settlement_locks + reconciliation_logs tables |
| `supabase/functions/payment-stk-callback/index.ts` | Add status/receipt idempotency guards at top of each entity handler |
| `supabase/functions/contributions-crud/index.ts` | Replace financial_ledger check with atomic settlement_locks insert |
| `supabase/functions/c2b-confirm-payment/index.ts` | Add conflict handling on contribution insert |
| **New** `supabase/functions/financial-reconciliation/index.ts` | Background reconciliation job |
| `supabase/config.toml` | Add `[functions.financial-reconciliation]` config |

### Summary

The core fix is simple: **the STK callback doesn't check if a contribution is already `completed` before re-processing it, and the settlement engine's idempotency check has a race condition**. Adding a unique `settlement_locks` table + status guards in the callback eliminates all double-payment scenarios. The unique DB constraints act as a final safety net. The reconciliation job provides ongoing monitoring.

