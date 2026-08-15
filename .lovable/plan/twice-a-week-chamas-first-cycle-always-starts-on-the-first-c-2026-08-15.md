# Twice-a-week chamas: first cycle always starts on the first chosen day

## The change

Today, a Monday & Friday chama started on a Wednesday closes its first cycle that Friday — whichever chosen day comes next. That is wrong.

New rule: the first cycle always closes on the **first chosen day** (the day the creator picked as day 1), so the schedule always begins at the top of the pattern.

- Start Wednesday, days Monday & Friday -> cycle 1 closes the coming **Monday** at 10:00 PM EAT, first payout that night. Cycle 2 closes **Friday**, then Monday, alternating.
- Start **on** the first chosen day (Monday itself) -> cycle 1 closes **next week's Monday** (full 7-day window).
- Start Sunday -> cycle 1 closes the very next day, Monday.

Cycles after the first already alternate correctly and are unchanged.

## Manager guidance before starting

On the pre-start dashboard, the manager sees a live schedule preview:

```text
If you start today (Wed 19 Aug):
  Cycle 1 closes  Mon 24 Aug, 10:00 PM  -> first payout that night
  Cycle 2 closes  Fri 28 Aug, 10:00 PM
  Members must pay before each 10:00 PM deadline
```

Clicking Start opens a confirmation dialog restating those exact dates, so nobody starts on the wrong day by accident. The preview updates itself as the days pass.

## Technical details

- `supabase/functions/_shared/chamaDeadlines.ts` — rewrite `getTwiceWeeklyFirstDeadline` to anchor on `weekly_contribution_day` (day 1) instead of the nearest of the two days. Distance is `(day1 - todayDow + 7) % 7`, treating 0 as 7 so starting on the anchor day rolls a full week. Deadline stays 10:00 PM EAT.
- `supabase/functions/chama-start/index.ts` and `chama-start-new-cycle/index.ts` — no signature change; they pick up the new behaviour. Verify the payout-date projections that follow the first cycle still walk with `getNextChamaCycleWindow`.
- `supabase/functions/cycle-auto-create/chamaDeadlines_test.ts` — add cases: Wed start with Mon/Fri closes Monday; Monday start closes next Monday; Sunday start closes Monday; a Sat/Sun pair across a year boundary.
- `src/utils/chamaDeadlines.ts` / a small shared helper — expose the same first-deadline maths to the frontend so the preview matches the backend exactly (shared Kenya-time utility only, no local date maths).
- `src/components/chama/PreStartDashboard.tsx` — add the schedule preview panel and wrap the Start action in an AlertDialog listing cycle 1 and cycle 2 dates.

Twice-monthly, monthly, weekly, daily and every-N-days scheduling are untouched.
