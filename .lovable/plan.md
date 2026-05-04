## The Problem (confirmed via DB queries)

Your dashboard shows **Chama Gross KES 3,066.30** but **Commission KES 35.80**. That's only ~1.17% — impossible when the rate is 5%.

Two distinct bugs are combining:

### Bug 1 — Payouts are being counted as gross revenue
The `financial_ledger` has 3 chama **payout** rows (KES 190 + 95 + 2,375 = **2,660**) being summed into "gross". Payouts are *outflows* of money already collected — they must never be added to gross collected. Real chama gross from contributions = **KES 406.30**, commission **KES 35.80** (≈8.8%, which is correct given a penalty was charged on one row).

### Bug 2 — The stray .30 (and why fractional shillings appear)
The ledger row of `gross_amount = 100.30` corresponds to a real M-Pesa payment of **KES 106** (receipt UD67RBWEG4). The settlement engine split it:
- 100.30 logged as "cycle gross"
- 5.70 held as carry-forward (excluded from gross)
- 5.30 commission (5% of the full 106)

So the *real* gross was 106, but the ledger stored 100.30 because carry-forward was subtracted from the gross figure while commission was still computed on the full 106. The `gross_amount` column should always equal what the customer actually paid — never an internal accounting fragment.

## The Fix

### 1. RevenueDashboard — exclude payouts from "Gross"
File: `src/components/admin/RevenueDashboard.tsx`

In `fetchAllEntries` (lines 135–158) and the source-breakdown reducer (lines 257–273), filter out rows where `transaction_type = 'payout'` for **gross/commission/net** aggregation. Payouts are not revenue events; they should only be visible in the raw transactions table (filterable), never in the Gross/Commission KPIs or the per-source totals.

Approach:
- Add a constant `REVENUE_TX_TYPES = ['contribution', 'donation']` (i.e. inflow types).
- Filter `entries` and `prevEntries` by `REVENUE_TX_TYPES` before computing `totalGross`, `totalCommission`, `totalNet`, `grossPct`, `commissionPct`, `netPct`, the timeseries, and the source breakdown.
- Keep the raw transactions table showing all rows (so payouts are still auditable), but tag them visually so it's obvious they don't count toward gross.
- Add a small "Payouts (outflow)" stat card so admins still see total payouts processed — clearly separated from revenue.

### 2. contributions-crud — store the real payment amount as gross
File: `supabase/functions/contributions-crud/index.ts` (around line 695–727)

Currently:
```ts
const chamaGross = grossPaymentAmount - carryForward;  // produces 100.30
```

Change to:
```ts
const chamaGross = grossPaymentAmount;  // the actual KES the user paid (e.g. 106)
```

The ledger's `gross_amount` MUST equal the real M-Pesa amount. Carry-forward is tracked separately on `chama_overpayment_wallet` and `member.carry_forward_credit` — it should not subtract from the recorded gross. Commission is already computed on the full payment, so this restores the invariant: **commission_amount = gross_amount × commission_rate**, always.

Update the description to keep the carry-forward note for transparency:
```
FIFO debt settlement. Paid: KES 106. Cleared: 1 period. Carry-forward: 5.70. Penalty: 0.00
```

### 3. Backfill the existing bad row
A one-time migration to correct the historical row:
- Update `financial_ledger` row `abb80138...` from `gross_amount = 100.30` → `106.00`, `net_amount = 95.00` → `100.70`.
- This brings your historical totals to whole shillings and matches reality.

### 4. Add an integrity check (defensive)
A new validation trigger on `financial_ledger` INSERT/UPDATE: reject rows where `abs(gross_amount - commission_amount - net_amount) > 0.01` for `transaction_type IN ('contribution','donation')`. Prevents future drift.

## Result After Fix

For your current data the dashboard will show:
- **Chama Gross: KES 412.00** (was 3,066.30) — real money collected
- **Chama Commission: KES 35.80** — unchanged, correct at ~8.7% (one payment had a penalty)
- **Chama Payouts (outflow): KES 2,660** — shown separately
- No more fractional shillings.

## Files Touched

- `src/components/admin/RevenueDashboard.tsx` — filter payouts out of revenue aggregations, add payouts stat card
- `supabase/functions/contributions-crud/index.ts` — record real payment as `gross_amount`
- `supabase/migrations/<new>.sql` — backfill the one bad row + add validation trigger
- No changes to commission logic, payment flow, or user-facing payment screens.

## Out of Scope

- Welfare and Mchango ledger sums look mathematically consistent — no changes there.
- Payout entries themselves remain in the ledger for audit; only their classification in the dashboard changes.