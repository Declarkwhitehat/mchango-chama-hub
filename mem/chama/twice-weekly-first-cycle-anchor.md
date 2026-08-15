---
name: Twice-weekly first cycle anchor
description: Twice-a-week chamas always close cycle 1 on the first chosen weekday, never the nearest of the two days
type: feature
---

For `twice_weekly` chamas, the FIRST cycle always closes on the chama's **first chosen weekday** (`weekly_contribution_day`), so the schedule always starts at the top of the pattern.

- Mon & Fri started Wednesday -> cycle 1 closes the coming **Monday**; cycle 2 Friday; alternating after that.
- Starting **on** the anchor weekday rolls a full 7 days (next week's Monday).
- Deadline time is 21:00 EAT (18:00 UTC) for every cycle, first or later.

Implemented in `getTwiceWeeklyFirstDeadline` (`supabase/functions/_shared/chamaDeadlines.ts`, mirrored in `src/utils/chamaDeadlines.ts`). Managers see a live "If you start today" preview plus a confirmation dialog with cycle 1 / cycle 2 dates in `PreStartDashboard.tsx`.
