# Fix: timer invents a payment round that will never exist

## What's wrong

Chama "Test" has 2 active members, so it runs exactly 2 cycles. Cycle 1 paid out on 14 Aug; cycle 2 is the final one, ending tonight at 10:00 PM EAT, and you have already paid it in full.

Once a member is paid up for the open cycle, the payment timer looks for the next cycle row. There isn't one (and never will be), so it falls back to guessing a date one frequency-step later — producing the bogus "next payment due in 1d 10h". The backend is correct: when the last cycle closes, the chama is marked cycle complete and no cycle 3 is created. Only the timer's guess is wrong.

## The fix

In the payment timer:

- Remove the invented-deadline fallback entirely. Never show a countdown to a cycle that does not exist as a real record.
- When the member is paid up for the open cycle, decide what to show based on whether more rounds remain:
  - If the open cycle is the last one (its cycle number equals the number of approved active members), show a calm final-cycle state: "You're fully paid. This is the final cycle — payouts complete after tonight's deadline", with the cycle-2 deadline shown for reference and no countdown to a future payment.
  - If more rounds remain but the next cycle hasn't been created yet (it is created right after the current one closes), show "You're paid up for this cycle. The next cycle opens after tonight's deadline" — again with no fabricated countdown.
  - If a real next cycle row already exists, keep counting down to that real deadline.
- Keep the unpaid state exactly as it is today: red countdown to the current cycle deadline.

## Technical notes

- File: `src/components/chama/NextPaymentTimer.tsx`.
- Delete `estimateNextDeadline` and its usage.
- Add a count query on `chama_members` filtered to `approval_status = 'approved'` and `status = 'active'` to get the total round count, and compare it with the open cycle's `cycle_number` — this mirrors the rule the `cycle-auto-create` function already uses to mark a chama `cycle_complete`.
- No database or edge function changes; this is a presentation fix only.
