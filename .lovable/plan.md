

# Plan: Production-Ready Performance Optimizations

## Summary
Optimize the app for high traffic across 10 areas: cron schedules, caching, error handling, pagination, query optimization, rate limiting, and more.

## Current State
- **Cron jobs**: 13 scheduled jobs, some running hourly or every 15 min (welfare-cooling-off-payout runs `*/15 * * * *`)
- **No ErrorBoundary**: App has no global error boundary
- **No React Query usage**: Most pages use raw `useState/useEffect` with direct Supabase calls — no caching, no retry
- **No pagination**: List pages (ChamaList, MchangoList, OrganizationList, WelfareList) fetch up to 50 records at once
- **No debounce on form submissions**: Buttons have no double-click protection
- **chama-auto-cleanup** already selects specific columns (good)
- **chama-cycle-complete** uses `select('*')` with nested joins

## Changes

### 1. Reschedule Cron Jobs (SQL insert — not migration)
Update these cron jobs via `cron.unschedule` + `cron.schedule`:

| Job | Current | New |
|-----|---------|-----|
| chama-auto-cleanup-hourly | `0 * * * *` | `0 */2 * * *` (every 2h) |
| chama-auto-restart-hourly | `30 * * * *` | `30 */2 * * *` (every 2h) |
| welfare-cooling-off-payout | `*/15 * * * *` | `*/45 * * * *` (every 45 min — withdrawal-related) |
| cleanup-failed-transactions | `0 */10 * * *` | keep as-is (already every 10h) |
| Others (daily/weekly) | keep as-is | no change |

### 2. Add Global Error Boundary
- **New file**: `src/components/ErrorBoundary.tsx` — React class component catching render errors, showing a friendly "Something went wrong" card with a "Try Again" button
- **Edit**: `src/App.tsx` — wrap `<AppContent />` with `<ErrorBoundary>`

### 3. Create `useSupabaseQuery` Custom Hook with Caching + Retry
- **New file**: `src/hooks/useSupabaseQuery.ts` — lightweight hook wrapping React Query's `useQuery` with:
  - 5-minute `staleTime` for cached data
  - Auto-retry with exponential backoff (3 attempts)
  - Loading/error states returned

### 4. Add Pagination to List Pages
For each list page, add a "Load More" button pattern (load 20 at a time):
- **Edit**: `src/pages/ChamaList.tsx` — paginated fetch with offset, "Load More" button
- **Edit**: `src/pages/MchangoList.tsx` — same pattern
- **Edit**: `src/pages/OrganizationList.tsx` — same pattern  
- **Edit**: `src/pages/WelfareList.tsx` — same pattern
- **Edit**: `src/pages/Activity.tsx` — paginate transactions (20 per tab)

### 5. Add `useDebounceAction` Hook for Button/Form Protection
- **New file**: `src/hooks/useDebounceAction.ts` — hook that wraps async actions with:
  - `isProcessing` state to disable buttons during submission
  - Cooldown period (2 seconds) after completion
  - Prevents duplicate calls

### 6. Apply Debounce to Key Forms
- **Edit**: `src/components/DonationForm.tsx`
- **Edit**: `src/components/ChamaPaymentForm.tsx`
- **Edit**: `src/components/WithdrawalButton.tsx`
- **Edit**: `src/components/chama/JoinByCodeForm.tsx`
- **Edit**: `src/pages/ChamaCreate.tsx`
- **Edit**: `src/pages/MchangoCreate.tsx`
- **Edit**: `src/pages/WelfareCreate.tsx`
- **Edit**: `src/pages/OrganizationCreate.tsx`
- Wrap submit handlers with debounce, disable buttons while `isProcessing`

### 7. Optimize `chama-cycle-complete` Edge Function
- **Edit**: `supabase/functions/chama-cycle-complete/index.ts` — replace `select('*', ...)` with specific columns: `id, name, last_cycle_completed_at, group_code` for chama and `phone, full_name` for profiles

### 8. Consolidate Duplicate Queries on Home Page
- **Edit**: `src/pages/Home.tsx` — the welfare fetch already happens via edge function; no duplicates found, but will consolidate the chama created-by + member-of queries into a single combined result set to avoid two separate DB calls

### 9. Convert Key List Pages to React Query
Convert the raw `useEffect` data fetching in ChamaList, MchangoList, OrganizationList to use React Query (via `useQuery`) for automatic caching (5-minute staleTime), retry, and deduplication of identical requests.

### 10. Optimize Withdrawal Queries in Activity Page  
- **Edit**: `src/pages/Activity.tsx` — add `updated_at` timestamp filter for withdrawals, only fetching records updated since last check

## Files Summary

| Action | File |
|--------|------|
| New | `src/components/ErrorBoundary.tsx` |
| New | `src/hooks/useDebounceAction.ts` |
| Edit | `src/App.tsx` — add ErrorBoundary |
| Edit | `src/pages/ChamaList.tsx` — pagination + React Query |
| Edit | `src/pages/MchangoList.tsx` — pagination + React Query |
| Edit | `src/pages/OrganizationList.tsx` — pagination + React Query |
| Edit | `src/pages/WelfareList.tsx` — pagination |
| Edit | `src/pages/Activity.tsx` — pagination + withdrawal optimization |
| Edit | `src/pages/Home.tsx` — consolidate queries |
| Edit | `supabase/functions/chama-cycle-complete/index.ts` — select specific columns |
| Edit | `src/components/DonationForm.tsx` — debounce |
| Edit | `src/components/ChamaPaymentForm.tsx` — debounce |
| Edit | `src/components/WithdrawalButton.tsx` — debounce |
| Edit | `src/components/chama/JoinByCodeForm.tsx` — debounce |
| Edit | `src/pages/ChamaCreate.tsx` — debounce |
| Edit | `src/pages/MchangoCreate.tsx` — debounce |
| Edit | `src/pages/WelfareCreate.tsx` — debounce |
| Edit | `src/pages/OrganizationCreate.tsx` — debounce |
| SQL | Reschedule 3 cron jobs |

## Technical Notes
- **Connection pooling**: Supabase JS client already uses HTTP-based connections (not persistent DB connections). The Supabase infrastructure handles connection pooling server-side via PgBouncer. No client-side changes needed — this is already optimized.
- **React Query** is already installed and configured in `App.tsx` with good defaults. The issue is most pages don't use it — they use raw `useEffect`. Converting them gives us free caching, retry, and deduplication.
- Cron jobs are managed via `cron.schedule` SQL — will use `cron.unschedule` + `cron.schedule` to update.

