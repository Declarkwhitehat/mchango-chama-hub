

# Admin Dashboard: Daily Growth Indicators

## Overview
Enhance the admin dashboard and Platform Statistics component to show **total counts** alongside **today's increase** for Chamas, Campaigns, and Organizations. Each stat card will display a green "+N today" indicator showing how many were created in the last 24 hours.

## Changes

### 1. Update `PlatformStatistics.tsx`
- Add 3 new parallel queries to count entities created today (using `.gte('created_at', todayStart)` for `chama`, `mchango`, and `organizations` tables)
- Add `organizations` total and active counts (currently missing from this component)
- Display "+N today" badge in green below each stat card's total number

### 2. Update `AdminDashboard.tsx` (`fetchDashboardData`)
- Add 3 new parallel queries for today's new counts:
  - `chama` created today
  - `mchango` created today  
  - `organizations` created today
- Add these to the stats state: `chamasToday`, `campaignsToday`, `organizationsToday`
- Update the **Key Metrics Grid** "Active Groups" card to show "+N today"
- Update the **Campaigns Overview** and **Organizations Overview** cards at the bottom to show "+N today"

### Technical Details

**New queries (added to the existing `Promise.all`):**
```typescript
supabase.from('chama').select('*', { count: 'exact', head: true })
  .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
supabase.from('mchango').select('*', { count: 'exact', head: true })
  .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
supabase.from('organizations').select('*', { count: 'exact', head: true })
  .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
```

**Display format example:**
- Total: **12** (bold, large)
- Subtitle: "8 active"
- Growth badge: "+3 today" (green text, or muted if 0)

No database changes are needed -- this uses existing `created_at` columns on all three tables.

