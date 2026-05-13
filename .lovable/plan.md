## Goal

Make the admin **Total Revenue** KPI a single source of truth that includes:

1. Commission revenue (chama / mchango / organization / welfare contributions) — already counted ✅
2. **M-PESA B2C company revenue** (the markup over Safaricom cost on every payout) — currently missing ❌
3. **Account verification fees** — already counted ✅
4. **Campaign / Welfare / Organization verification fees** — inserted but bucketed as "Other" ❌

Today the B2C revenue only appears in the small `MpesaFeeSummary` widget and group-verification fees show up under "Other". After this change, all four streams roll up into the same `kpis.totalRevenue` and into a clearly-labeled source breakdown row.

## Changes

### 1. Insert B2C company revenue into `company_earnings` on payout completion

File: `supabase/functions/b2c-callback/index.ts`

Right after the withdrawal is atomically marked `completed` (around line 320), insert:

```ts
if (Number(withdrawal.company_revenue || 0) > 0) {
  await supabaseAdmin.from('company_earnings').insert({
    amount: Number(withdrawal.company_revenue),
    source: 'mpesa_b2c_revenue',
    description: `B2C payout markup — withdrawal ${withdrawal.id}`,
    group_id: withdrawal.chama_id || withdrawal.organization_id || withdrawal.mchango_id || withdrawal.welfare_id || null,
    reference_id: withdrawal.id,           // for idempotency / drill-down
  });
}
```

Idempotency: the callback already early-returns when `status === 'completed'`, so this insert runs at most once per withdrawal. We additionally guard with a `select` on `reference_id` before inserting to handle any retries safely.

### 2. Backfill historical B2C revenue (one-time)

For every `withdrawals` row where `status='completed'` and `company_revenue > 0` and no matching `company_earnings.reference_id` exists, insert the same row as above. Single SQL `INSERT … SELECT … WHERE NOT EXISTS`.

### 3. Recognize all fee sources in the dashboard breakdown

File: `src/components/admin/RevenueDashboard.tsx`

- Add buckets:
  - `mpesa_b2c_revenue` → label "M-PESA B2C Revenue", own color
  - `verification_fee` already exists; expand `EARNINGS_SOURCE_TO_BUCKET` to include `verificationfee` (group verification source) so it stops falling into "Other"
- Order the source-breakdown table so the four revenue streams (chama / mchango / organization / welfare commission, B2C revenue, verification fees) are always visible.
- No changes needed to `kpis.totalRevenue` math — it already sums `company_earnings` via `standaloneEarningsSum`, so the new rows flow in automatically.

### 4. Keep the `MpesaFeeSummary` card

Leave the existing fee-detail card in place; it remains useful for splitting Safaricom cost vs. company revenue. Add a one-line note: "Company Revenue is included in Total Revenue above."

## Out of scope

- No changes to fee calculation, B2C request payload, or commission rates.
- No changes to existing `company_earnings` rows other than the historical B2C backfill.
- No new tables; we reuse `company_earnings` as the canonical revenue ledger.

## Verification

- Trigger one completed B2C payout (or run backfill on existing completed withdrawals) and confirm a `company_earnings` row appears with `source='mpesa_b2c_revenue'`.
- On the admin Revenue page, confirm Total Revenue increases by the B2C company-revenue sum and a "M-PESA B2C Revenue" row appears in the source breakdown.
- Submit a group verification request → confirm it now appears under "Verification Fees" instead of "Other".
