## Goal

Make the two amount tiles in the chama detail/dashboard clearer:

1. **Total Contribution** — shows everything contributed to the chama so far (net of commission), which is the running pool that will fund payouts.
2. **Per-cycle amount tile** — renamed to the chama's frequency (e.g. "Daily", "Weekly", "Monthly"). This is the amount each member contributes per cycle and that gets sent out as the payout.

## Changes

### 1. `src/pages/ChamaDetail.tsx` (header card, ~lines 553–567)

- Rename tile label **"Total Collected (Net)" → "Total Contribution"**. Keep the value `totalContributions` (already the net total contributed so far) and the small helper text about commission.
- Rename second tile label **"Contribution" → frequency label**:
  - `daily` → "Daily"
  - `weekly` → "Weekly"
  - `monthly` → "Monthly"
  - `twice_monthly` → "Twice Monthly"
  - `every_n_days` → `"Every ${every_n_days_count} Days"`
  
  Value stays `KES {chama.contribution_amount}`. Add a small caption underneath: *"Amount each member pays per cycle — sent as payout."*
- Remove the now-redundant "Frequency: …" line below the grid (since the tile label already shows it).

### 2. `src/components/MemberDashboard.tsx` (~lines 249–255)

- Rename the "Contribution" tile to the same frequency label (Daily / Weekly / Monthly / Twice Monthly / Every N Days).
- Remove the duplicate frequency caption underneath (it's now in the label).

### 3. Helper

Add a small inline helper `frequencyLabel(frequency, everyN)` in both files (or a shared util `src/utils/chamaFrequency.ts`) to keep label mapping consistent.

## Out of scope

- No backend / data changes — both values already exist.
- No styling/layout changes beyond the label swaps.
