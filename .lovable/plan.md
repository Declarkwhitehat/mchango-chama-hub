## Root cause

Welfare contributions never reach `financial_ledger`, so the admin "Live Data Cross-Verification" shows Welfare ledger = 0 while the live `welfare_contributions` table has real rows. Both online write paths for welfare are missing the ledger insert that Mchango and Organizations already do:

- `supabase/functions/welfare-contributions/index.ts` — the in-app STK / manual recording path. Writes `welfare_contributions`, updates `welfares` balances, calls `record_company_earning`, but never inserts to `financial_ledger`.
- `supabase/functions/payment-stk-callback/index.ts` (welfare branch, ~lines 393–500) — same gap. Mchango branch (~583) and Organization branch (~760) both insert into `financial_ledger`; the welfare branch does not.

The offline C2B path (`c2b-confirm-payment/index.ts` ~line 991) already inserts a welfare ledger row, which is why some welfare payments may appear and others don't — the mismatch is deterministic per channel.

## Fix

### 1. Add ledger writes on both welfare write paths

In `supabase/functions/welfare-contributions/index.ts`, after each `recordRow(...)` succeeds and after the `welfares` balance update, insert a paired `financial_ledger` row using the same shape as the c2b welfare insert:

```
transaction_type: 'contribution'
source_type: 'welfare'
source_id: welfare_id
reference_id: <welfare_contributions.id>
gross_amount, commission_amount, net_amount, commission_rate
payer_name / payer_phone: from profile lookup
description: 'Welfare contribution' or 'Welfare registration fee (10%)'
```

Wrap the insert in a try/catch that `console.error`s but does not fail the contribution (the contribution row is already committed).

In `supabase/functions/payment-stk-callback/index.ts` welfare branch, add the same insert right after the `welfares` balance update, mirroring the Mchango/Organization pattern already in the same file.

For split payments (registration + contribution from one payment), insert one ledger row per component so `gross × rate = commission` stays valid for the `trg_validate_financial_ledger_integrity` trigger.

### 2. Backfill historical welfare contributions

One-time migration that inserts a `financial_ledger` row for every `welfare_contributions` row with `payment_status = 'completed'` that has no matching ledger row (match on `reference_id = welfare_contributions.id` AND `source_type = 'welfare'`). Use `category` to decide the description and rate. Wrap in a single transaction; safe to re-run because of the NOT EXISTS guard.

Sketch:

```sql
INSERT INTO public.financial_ledger
  (transaction_type, source_type, source_id, reference_id,
   gross_amount, commission_amount, net_amount, commission_rate,
   description, created_at)
SELECT
  'contribution', 'welfare', wc.welfare_id, wc.id,
  wc.gross_amount, wc.commission_amount, wc.net_amount,
  CASE WHEN wc.gross_amount > 0
       THEN ROUND((wc.commission_amount / wc.gross_amount)::numeric, 4)
       ELSE 0 END,
  CASE WHEN wc.category = 'registration_fee'
       THEN 'Welfare registration fee (backfill)'
       ELSE 'Welfare contribution (backfill)' END,
  wc.completed_at
FROM public.welfare_contributions wc
WHERE wc.payment_status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_ledger fl
    WHERE fl.reference_id = wc.id AND fl.source_type = 'welfare'
  );
```

### 3. Safeguard

Both new inserts log any error via `console.error('financial_ledger welfare insert failed', ...)` so it appears in edge function logs, matching the pattern used elsewhere. No new alerting infra beyond existing edge log surfaces.

### 4. Verification

After deploy + migration, reload the admin dashboard's Live Data Cross-Verification. The Welfare row should show ledger total = live total (variance 0, "Match").

## Files touched

- `supabase/functions/welfare-contributions/index.ts` — add ledger insert per recorded row
- `supabase/functions/payment-stk-callback/index.ts` — add ledger insert in welfare branch
- `supabase/migrations/<new>.sql` — backfill missing welfare ledger rows

No frontend changes required — the dashboard already reads from `financial_ledger` correctly.
