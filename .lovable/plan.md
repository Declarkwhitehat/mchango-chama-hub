## Goal
Make the admin Revenue Dashboard show **Deleted Account Funds** as a first-class source, and tighten reconciliation so every revenue stream (commission, verification fees, withdrawal fees, abandoned funds, etc.) is counted exactly once and matches its underlying ledger.

## Changes

### 1. Add "Deleted Account Funds" to Breakdown by Source
File: `src/components/admin/RevenueDashboard.tsx`

- Add `abandoned_funds` to `SOURCE_COLORS` (distinct red/brown tone) and `SOURCE_LABELS` ("Deleted Account Funds").
- Add mapping entries in `EARNINGS_SOURCE_TO_BUCKET` for `abandoned_funds` and camelCase variant so it always lands in the dedicated bucket instead of the generic fallback.
- Include the bucket in the pie chart, stacked-source chart, and the source filter dropdown.

### 2. Add a KPI tile for Deleted Account revenue
Same file. New small card next to Verification Fees showing:
- Total swept from deleted accounts in the selected period
- Count of deletions
- Comparison delta vs. previous period
Source: `company_earnings` rows with `source = 'abandoned_funds'` (already fetched — just a new memoized total).

### 3. Reconciliation audit pass (accuracy, no double counting)
Same file.
- Confirm `abandoned_funds` is NOT in `LEDGER_DUPLICATED_EARNINGS` (it isn't today) so it counts once via `company_earnings`.
- Verify verification-fee variants all normalise to the same bucket (already handled) — add missing `entityVerificationFee` / `entity_verification_fee` aliases if they appear in data.
- Add a lightweight cross-check line under the totals: "Ledger commission + Company earnings fees = Displayed total" so any future drift is visible.

### 4. Surface the abandoned-funds ledger link
Under the new tile, add a "View details" link to `/admin/abandoned-funds` so the breakdown card is auditable back to the per-deletion rows.

## Out of scope (call out, don't build)
- No new sweep code paths. Only the existing `mchango-creator-delete` sweeps to `abandoned_funds`. Self-account-deletion today does not sweep balances because it already blocks users who hold funds / manage groups. If you want deleted-user residual balances swept automatically as well, that's a separate follow-up.

## Verification
1. Open `/admin/revenue`. "Deleted Account Funds" appears in the pie chart, stacked chart, and source filter.
2. Delete an expired test campaign with a balance. The KPI tile increases by the swept amount and the new row appears in `/admin/abandoned-funds`.
3. Sum of per-source buckets equals the "Total Revenue" KPI (no double counting).
