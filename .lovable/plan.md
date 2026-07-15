## Goal

Fix the Welfare Contributions Report PDF so the totals reconcile with the welfare balance. Today it only shows a "Total Amount" summed from `gross_amount`, which is why 6,190 on the PDF doesn't match the on-screen balance (balance is net of platform commission).

## Scope

Single file: `src/components/welfare/WelfareTransactionLog.tsx` (the generator of the uploaded PDF). No backend / schema changes.

## Changes

1. **Header summary line** — replace the single "Total Amount" with three figures:
   - `Total Gross: KES X`
   - `Total Commission: KES Y`
   - `Total Net (credited to balance): KES Z`

2. **Table columns (Contributions tab only)** — expand from `Amount` into three narrower columns:
   - `Gross` (from `gross_amount`)
   - `Commission` (from `commission_amount`, fallback 0)
   - `Net` (from `net_amount`, fallback = gross − commission)
   Keep #, Name, Phone, Date. Adjust column x-offsets so the row fits the page.

3. **Footer totals row** — bold row under the table repeating the three totals so it's obvious the Net matches the welfare balance.

4. **Withdrawals tab** — unchanged (already uses `amount`).

5. **On-screen table** — leave as-is (report is the reconciliation surface); no UI/logic changes elsewhere.

## Why this resolves the confusion

- Gross (6,190) − Commission (≈ 5–7%) = Net credited to the welfare pool.
- The Net total will equal the contributions portion of the welfare balance, so managers can reconcile at a glance.
- Registration-fee partial credits (e.g. the KES 30 row) remain visible as gross rows but their commission/net columns will show the actual credited amount.

## Out of scope

- No changes to how commission is calculated or stored.
- No changes to balance computation.
- No changes to the Welfare Report component in `WelfareContributionReport.tsx` (already shows gross/commission/net).
