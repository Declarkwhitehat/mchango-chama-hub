

## Plan: Show All-Time Total Contributions Everywhere, Available Balance Only for Creators

The detail pages (MchangoDetail, OrganizationDetail) are already correctly showing all-time collected with available balance only for creators. However, the **list pages** and **explore page** still use `current_amount` (which decreases after withdrawals) instead of `total_gross_collected`.

### Files to Update

#### 1. `src/pages/MchangoExplore.tsx` (public explore page)
- Add `total_gross_collected` to the Mchango interface
- Add `total_gross_collected` to the select query (line 44)
- Change progress calculation and display (lines 188, 222-223) to use `total_gross_collected` instead of `current_amount`

#### 2. `src/pages/MchangoList.tsx` (authenticated user list)
- Add `total_gross_collected` to the Mchango interface
- Change all card displays (lines 210-211, 247, 286-288, 323) to use `total_gross_collected` instead of `current_amount`
- Update progress calculations to use `total_gross_collected`

#### 3. `src/pages/OrganizationList.tsx` (organization list)
- Add `total_gross_collected` to the Organization interface
- Change the OrganizationCard display (line 154) from `current_amount` to `total_gross_collected`

### What Changes Visually

- **Everyone sees**: "KES X raised" / "Total Contributions: KES X" using `total_gross_collected` - the true all-time total that never decreases
- **Only creators see**: "Available balance: KES X" on the detail pages (already implemented)
- Progress bars and percentages use `total_gross_collected` everywhere

### No Database Changes Required
The `total_gross_collected` column already exists on both `mchango` and `organizations` tables.

