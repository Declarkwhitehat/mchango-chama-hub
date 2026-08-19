# Fix: false "missed payment" wording and payout queue numbering

## What I found

I checked Dove Association's live data for your member record (5VD2M0016):

- Missed payments counter: **0**. Outstanding debts: **none**. Deficit: **0**.
- Cycle 1: paid in full (KES 250).
- Cycle 2 (open, closes Fri 21 Aug, 9:00 PM EAT): paid KES 150, KES 100 still due — so you are **partially paid**, not missed.

So the engine agrees with you: nothing is missed. Anything still saying "missed" on your dashboard is a wording/label problem in the UI, not bad data. The remaining places that can still print the word are the cycle-history badges and the alert banners, which key off a cycle's status rather than "has the 9:00 PM deadline actually passed".

Payout tab, Dove Association order is correct in the database: Festus #1, Judith Akama #2, James Musembi #3. The display is what is wrong:

- The "Next to Receive" card shows the current recipient (Judith) **without any position number**.
- The upcoming list below numbers people by their place in the queue array, not by their real payout position — so James, who is genuinely #3, prints as "Position #2".

Nothing is broken in the payout order or the money; it is purely a numbering label bug that makes it look like two people share position #2.

## What will change

### 1. No "missed" wording unless a deadline has truly passed
- Cycle history badges: an open cycle with a part payment shows "Partially Paid - KES X left, due <date>"; an open cycle with no payment shows "Pending - due <date>". "Missed" only renders once that cycle's 9:00 PM EAT deadline is in the past and money is still owed.
- The "Missed Cycles" alert banner and the dashboard "1 Missed Payment" / "N Consecutive Missed Payments" cards additionally require at least one genuinely overdue cycle, so a stale counter alone can never trigger them.
- Wording for open, partly-paid cycles becomes "KES X remaining for this cycle - due Friday 21 Aug, 9:00 PM" instead of anything implying failure.

### 2. Payout queue numbering
- Give the current recipient card an explicit position label (e.g. "Position #2 - Judith Akama - Receiving Fri 21 Aug").
- Number the upcoming list from each member's **actual payout position** (effective order index, honouring rescheduled positions for skipped members) instead of the array index, so the queue reads #1, #2, #3... with no duplicates or gaps and no unnumbered entry.
- Members already paid out keep their real position number too, so the "Received Payouts" list and the queue agree.

## Technical notes

- `src/components/chama/DailyPaymentStatus.tsx`: extend `resolveStatus` so 'missed' requires `deadlinePassed`, and gate the alert on the genuinely-overdue count; add the due-date to the pending/partial badge text.
- `src/components/MemberDashboard.tsx`: require a genuinely overdue open cycle (`cycleDeadlinePassed && cycleRemaining > 0`) in addition to `missed_payments_count` before rendering the missed-payment cards.
- `src/pages/ChamaDetail.tsx` payouts tab: compute `effectivePosition(m)` once (`was_skipped && rescheduled_to_position ? rescheduled_to_position : order_index`) and use it for the received list, the current-recipient card and the upcoming list, replacing `idx + 1` / `idx + (currentRecipient ? 2 : 1)`.
- No database or settlement-engine changes; balances, cycles and payout order stay exactly as they are.
