# Extend Welfare Contribution Deadline + Final-Day Countdown

## Goal
Executives can add extra days to a running contribution cycle (e.g. KES 300 set for 4 days can be extended before it ends), and every member sees a live countdown banner when 24 hours or less remain.

## 1. Extend deadline (executives only)
In the "Set Contribution Cycle" card (Manage tab), when an active cycle exists the card currently only shows a read-only "Active cycle in progress" notice. Add below it:

- An "Add more days" input (1–30) and an "Extend Deadline" button.
- On submit the cycle's end date moves forward by that many days from its current end date.
- Success toast shows the new deadline; the card refreshes.
- Only Chairman / Secretary / Treasurer can do this (enforced server-side, same rule as creating a cycle).
- Extension is only allowed while the cycle is still active and not yet expired.
- All active confirmed members get an in-app + push notification: the deadline has been extended to the new date, with their Member ID and Paybill 4015351 payment details. No SMS (reminders are push/in-app only).

## 2. Countdown banner in the final day
In the cycle status shown on the welfare Overview tab, when the active cycle has 24 hours or less remaining, show a prominent amber/red banner at the top:

- "Final day — X hours Y minutes left to pay KES 300"
- Ticks down live every minute.
- For members who have already paid the full amount, the banner reads as a calm confirmation instead ("You're fully paid for this cycle") rather than an urgent warning.
- Members who still owe see their exact outstanding amount and their Member ID with Paybill 4015351 instructions.

## Technical notes
- `supabase/functions/welfare-cycles/index.ts`: add a `PATCH` (or `action: 'extend'` POST) branch — validates token, executive role, cycle belongs to the welfare, status `active`, `end_date >= today`, and `extra_days` between 1 and 30; updates `end_date`, and bumps `deadline_days` accordingly; fans out notifications + push as the create branch already does.
- `src/components/welfare/WelfareContributionCycleManager.tsx`: add extend input/button inside the existing active-cycle `Alert`, calling the function and re-running `checkActiveCycle()`.
- `src/components/welfare/WelfareCycleStatus.tsx`: derive remaining ms from `activeCycle.end_date`, add a `setInterval` tick (60s) so the countdown is live, and render the new banner above the existing content when remaining <= 24h and > 0.
- No database schema change needed — `welfare_contribution_cycles.end_date` and `deadline_days` already exist.
