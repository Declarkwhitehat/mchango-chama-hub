## Issues identified

Looking at the SMS you received and the dashboard:

1. **Wrong payout date in SMS for Member #3.** The current formula is `startDate + (position - 1) × cycleLength`, so for position 3 daily it produces "May 6" — the same as the first deadline. It ignores the grace period and the cycle boundary (each cycle ends at 10:00 PM Kenya time). Correct payout for Member #3 should land on cycle 3's end = **Friday, May 8, 2026, 10:00 PM EAT**.

2. **"7 Pending" / "Pending Payment" badges show during the grace period.** During the first 24-hour grace window nobody has missed anything yet, so showing 7 members as "pending" alongside the countdown is confusing. The countdown timer (1d 21h … to May 6, 10:00 PM EAT) is actually correct — only the labeling around it is wrong.

3. **The unprofessional "dY %" garble** in the SMS — already addressed by the global SMS sanitizer in the previous turn; the reissued template below stays plain ASCII so it won't reappear.

## Fixes

### A. Correct payout-date math in `supabase/functions/chama-start/index.ts`
- Anchor the projection to the first cycle's 10:00 PM Kenya cutoff (`graceDeadline`), not to `startDate`.
- New formula: `payoutDate = graceDeadline + (memberIndex - 1) × cycleLength days`.
- Format the date in EAT (`Africa/Nairobi`) and append " at 10:00 PM" so members see the exact moment, e.g. *"Friday, May 8, 2026 at 10:00 PM"*.
- Clean wording (no emojis, no "before you" when it's 0):

  ```
  Pamojanova: "<chama>" has started. You are Member #<n> of <total>.
  Grace period: first payment of KES <amount> is due by <Tue May 5, 10:00 PM EAT>.
  Contribute <frequency>. Your payout: <Fri May 8, 2026 at 10:00 PM EAT>.
  Members ahead of you: <n-1>.
  ```

### B. Suppress "pending" noise during the grace period

`src/components/chama/PaymentStatusManager.tsx`
- Compute `isGracePeriod` from `chamaStartDate` using the existing `getNextDay10PmKenyaDeadline` helper.
- While in grace period:
  - Replace the red "X Pending" badge with a neutral "X yet to pay (grace period)" badge.
  - Replace the red "Pending Payment (n)" section header with "Yet to Pay — Grace Period".
  - Hide the "Unpaid members after the cutoff will be marked late…" warning under the timer (no penalties apply yet).

`src/components/chama/DailyPaymentStatus.tsx` already hides the "missed cycles" alert and financial summary during grace; no change needed there.

### C. Verify nothing else mislabels grace-period state
- `daily-cycle-manager` `all-cycles` already returns `status: 'pending'` (not 'missed') while end_date is in the future — no change.
- The countdown component is already correct; leave it untouched (the user confirmed "1d 21h 11m" lands on May 6, 10:00 PM EAT).

### D. Re-deploy `chama-start`

No DB schema or migration changes. No new memories required (existing SMS-sanitization and 22:00-EAT-deadline policies already cover this).