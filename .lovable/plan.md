## Root cause found

- **Chama set / W9BQM0003** had a pending overpayment wallet row of **KES 19** created on **06/06/2026 22:02 EAT**.
- Cycle #2 already existed, but wallet application only runs when a **new cycle is created**.
- When cycle #2 closed on **08/06/2026 22:00 EAT**, `daily-payout-cron` did **not** apply pending wallet rows before checking unpaid members.
- The member was marked as missed, then after the chama became `cycle_complete`, `chama-wallet-sweep` swept the wallet and sent it back to the member instead of using it for the missed cycle.
- The cycle-complete SMS still hardcodes `Pamojanova:` in `chama-cycle-complete`, causing long messages.
- Chama payout SMS depends on a callback SMS path plus older direct SMS helpers; the completion path exists, but needs hardening/logging and coverage for wallet sweep / normal chama payouts.

## Plan

1. **Centralize wallet application before any payout/missed-payment decision**
   - Add a reusable backend routine/function to apply pending `chama_overpayment_wallet` and `chama_late_payment_buffer` credits to the oldest open unpaid `member_cycle_payments` rows.
   - Credits are already net after commission, so compare them against the net cycle target and store a gross-equivalent paid amount without charging commission again.
   - Consume wallet rows FIFO and mark fully consumed rows `applied` with `applied_to_cycle_id`; keep partial remainders pending.
   - Increase the chama pool balance by the net credit applied.

2. **Call wallet application at every source of truth point**
   - In `daily-payout-cron`, run the wallet-credit application **immediately after claiming an overdue cycle and before**:
     - payout eligibility checks
     - `unpaidMembers` calculation
     - debt accrual
     - missed-payment count updates
     - freeze/removal rules
   - Keep existing wallet application in `cycle-auto-create` and `daily-cycle-manager`, but replace duplicated logic with the shared routine so daily, weekly, monthly, twice-monthly, and every-N-days schedules behave the same.
   - Ensure gap-recovery-created cycles also apply wallet credits before being marked missed.

3. **Repair the affected Chama set data safely**
   - Recompute W9BQM0003’s member balance from actual cycle/debt records.
   - Clear the false missed-payment state created by the wallet timing bug.
   - Review the already-swept KES 19 wallet payout so historical records remain financially consistent and the beneficiary shortfall is not silently hidden.

4. **Remove `Pamojanova:` from SMS bodies**
   - Update `chama-cycle-complete` and other chama SMS templates that hardcode the app name in the message body.
   - Keep sender identity to the SMS provider sender ID instead of wasting message characters.
   - Preserve required STOP text where already required.

5. **Harden payout transactional SMS**
   - In `b2c-callback`, ensure successful chama payout completion sends a final SMS like:
     - `You have received KES 38 from Chama "Chama set". Mpesa Ref: XXXXX.`
   - Include wallet-sweep and normal chama payout withdrawals.
   - Add fallback logging when SMS credentials/provider call fails so failed SMS delivery is visible in function logs.

6. **Add automated regression tests**
   - Add tests for wallet application timing across:
     - daily
     - weekly
     - monthly
     - twice-monthly
     - every-N-days
   - Add a test where a wallet row is created **after** the next cycle already exists but **before** payout processing; payout processing must apply it before marking missed.
   - Add SMS template tests/assertions to prevent `Pamojanova:` from returning to SMS bodies.

## Validation

- Re-query Chama set after the fix to confirm W9BQM0003 is no longer falsely marked as missed.
- Confirm pending wallet credit is applied before debt/missed-payment generation.
- Confirm payout SMS is generated after successful B2C callback.
- Run targeted edge/function tests for the wallet and SMS paths.