# Twice-a-Week Chama Contributions

Let chama creators pick two weekdays (e.g. Monday and Thursday). Each chosen weekday closes a cycle at the usual 10:00 PM EAT deadline, so members contribute twice a week and payouts land on those two days.

## How it will work

- New frequency option in chama creation: **Twice a Week**, with two dropdowns (First day / Second day). The second dropdown excludes whatever the first one picked, so the same day can't be chosen twice.
- Cycle 1 ends on the next chosen weekday after the chama starts; every following cycle ends on the next chosen weekday, alternating between the two (e.g. Mon → Thu → Mon → Thu).
- If the next chosen weekday is the same day the chama starts (or too close), the first cycle rolls to the following chosen day so members still get the normal payment window.
- Payout estimates, cycle countdowns, "next payment due" timers, end-date projections and reports all follow the same two-day rhythm — no drift.
- Existing chamas are untouched; nothing about daily/weekly/monthly/twice-monthly changes.

## Technical details

Database migration:
- Add `twice_weekly` to the `contribution_frequency` enum.
- Add `weekly_contribution_day` and `weekly_contribution_day_2` to `public.chama` (smallint, 0=Sunday…6=Saturday, nullable, CHECK 0–6, plus a check that they differ when both set).

Shared date engine (`supabase/functions/_shared/chamaDeadlines.ts`):
- Extend `ChamaCycleSchedule` with `weeklyDay` / `weeklyDay2`.
- Add a `twice_weekly` branch to `getNextChamaCycleWindow` that advances to the next chosen weekday at 22:00 EAT (start still 00:01 EAT the day after the previous cycle end).
- Add `getTwiceWeeklyFirstDeadline(reference, day1, day2)` mirroring `getTwiceMonthlyFirstDeadline`.
- Mirror the same logic in the frontend helper `src/utils/chamaFrequency.ts` (`addCyclesToDeadline` + `frequencyLabel` → "Twice a Week (Mon & Thu)").

Call sites to extend (every place that switches on frequency, so no branch falls through to the 7-day default):
- Edge functions: `chama-start` (first deadline + `getCycleLengthInDays` ≈ 3.5 → use the weekday-aware helper instead of a fixed length), `cycle-auto-create`, `chama-start-new-cycle`, `chama-auto-restart`, `daily-cycle-manager`, `daily-payout-cron`, `chama-reports`, `chama-crud` (persist/validate the two weekday fields on create + update).
- Frontend: `src/pages/ChamaCreate.tsx` (UI + validation), `src/pages/ChamaDetail.tsx`, `src/components/MemberDashboard.tsx`, `src/components/chama/ChamaEndDate.tsx`, `src/components/chama/CycleCompleteManager.tsx`, `src/components/chama/JoinByCodeForm.tsx`, `src/components/chama/NextPaymentTimer.tsx` label handling.

Validation & safety:
- `chama-crud` rejects `twice_weekly` without two distinct weekdays (0–6), so a half-configured chama can never be created.
- Extend `supabase/functions/cycle-auto-create/chamaDeadlines_test.ts` with twice-weekly cases (Mon/Thu sequence, week rollover, month/year boundary) and run the Deno tests before finishing.
