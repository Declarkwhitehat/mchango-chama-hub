

## Plan: Admin Revenue Dashboard

### Overview
Create a dedicated **Revenue** page in the admin panel that provides accurate, filterable revenue data sourced from the `financial_ledger` table (the single source of truth for all commissions). The page will support day/week/month/year filtering, professional KPI cards, trend charts, source breakdown, and downloadable PDF/CSV reports.

### Data Source
The `financial_ledger` table already records every commission earned with `commission_amount`, `commission_rate`, `gross_amount`, `net_amount`, `source_type` (mchango/chama/organization), `payer_name`, `payer_phone`, and `created_at`. This is the authoritative source -- no recalculation needed.

### What will be built

**1. New page: `src/pages/AdminRevenue.tsx`**
- Wrapped in `AdminLayout`
- Contains the new `RevenueDashboard` component

**2. New component: `src/components/admin/RevenueDashboard.tsx`**

**Filter Bar:**
- Period presets: Today, This Week, This Month, This Year, Custom Range
- Custom date range with date pickers
- Source filter (All / Mchango / Chama / Organizations / Welfare)
- Auto-recalculates on filter change

**KPI Cards Row (4 cards):**
- Total Revenue (commission earned in period)
- Total Gross Collected (volume processed)
- Transaction Count
- Average Commission per Transaction
- Each card shows comparison vs previous equivalent period (e.g., this week vs last week) with green/red percentage badge

**Revenue Trend Chart:**
- Area chart showing commission over time
- X-axis auto-adjusts: hourly for day, daily for week, daily for month, monthly for year
- Stacked by source (color-coded: Mchango pink, Chama blue, Organizations purple)

**Source Breakdown Section:**
- Pie chart + table side-by-side
- Table columns: Source, Gross, Commission, Rate, % of Total Revenue
- Bold totals row

**Transaction Ledger Table:**
- Paginated, sortable table of individual `financial_ledger` entries
- Columns: Date/Time, Source, Type, Payer, Gross, Rate, Commission, Net
- Search within results

**Report Downloads:**
- PDF Statement: Professional header, period, summary, breakdown, line items
- CSV Export: Full data dump for spreadsheet analysis

**3. Routing & Navigation**
- Add route `/admin/revenue` in `App.tsx`
- Add "Revenue" menu item in `AdminSidebar.tsx` under Financial section with a `DollarSign` icon, positioned at the top of the financial items list
- Remove the privilege code gate (unlike Commission Analytics) since this is a standard admin page

### Accuracy Guarantees
- All figures come directly from `financial_ledger` records (no client-side rate multiplication)
- Uses `commission_amount` as stored, not recalculated
- Date filtering uses `startOfDay`/`endOfDay` for precise boundaries
- Handles the 1000-row Supabase limit by using `.range()` pagination for the ledger table and aggregate queries with `.select('commission_amount')` for totals (fetching all matching rows)

### Files to create/edit
1. **Create** `src/pages/AdminRevenue.tsx`
2. **Create** `src/components/admin/RevenueDashboard.tsx`
3. **Edit** `src/App.tsx` -- add lazy import + route
4. **Edit** `src/components/admin/AdminSidebar.tsx` -- add menu item

