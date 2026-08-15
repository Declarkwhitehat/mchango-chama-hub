# Fix: "Today's Pool KES 0" on chama Test, and missing same-day payout

## What I found (verified against live data)

Chama **Test** (daily, KES 100, 2 members, 5% commission):

- Cycle 1 (13–14 Aug) closed correctly and paid KES 190 to member 1.
- Cycle 2 (ends today 22:00 EAT, beneficiary member 2) exists and **both members are fully paid**:
  - member 2 covered by the KES 95 net wallet credit carried from his KES 200 payment,
  - member 1 paid KES 100 today at 20:33 EAT (receipt UHFIH2ZKAD).
- Chama available balance is **KES 190** — the money is there.
- Yet cycle 2 has `payout_processed = false`, `payout_amount = 0`, **no withdrawal row**, and `is_complete = true`.

Two distinct defects produce what you see:

1. **A database trigger silently closes the cycle without paying.**
   `trigger_immediate_payout` on `member_cycle_payments` flips `is_complete = true` the moment every member is paid. It creates no payout and advances nothing.
   The pool function `get_chama_current_pool` only looks at cycles with `is_complete = false`, so the instant the last member paid, the pool flipped from KES 95 to **KES 0 / "No active cycle"** — even though KES 190 is sitting in the chama. The same flag also makes the payout code treat the cycle as gone, so payment paths can never complete it afterwards.

2. **The online M-Pesa STK path never triggers the immediate payout.**
   Today's payment came through `payment-stk-callback`, which delegates only settlement to `contributions-crud` (settle-only). The "all members paid → create payout → advance to next cycle" block lives only in the create-contribution branch and in the offline C2B function. So an online payment that completes a cycle settles the money but never pays out or opens cycle 3.

Result: money collected, cycle silently marked done, pool shows zero, member 2 unpaid.

## The fix

1. **Remove payout decisions from the database trigger**
   - Stop `trigger_immediate_payout` from setting `is_complete`. Completion becomes a payout-time fact only, written by the settlement/payout code that actually creates the withdrawal and the next cycle.

2. **One shared "cycle completion" routine used by every payment path**
   - Extract the existing all-paid → withdrawal → mark complete → `cycle-auto-create` sequence into a shared helper.
   - Call it from: online STK settlement (`payment-stk-callback` / `contributions-crud` settle-only), in-app contribution creation, offline C2B confirmation, and the scheduled payout cron.
   - Keep the existing duplicate guards (`claim_cycle_for_processing`, unique withdrawal per cycle) so retries can never double-pay.

3. **Make the pool never disappear while money is unpaid**
   - `get_chama_current_pool` selects the current cycle by date and `payout_processed = false`, regardless of `is_complete`, so the pool keeps showing the real collected amount until the payout actually leaves.
   - Refresh `members_paid_count` / `total_collected_amount` from the payment rows so the displayed counters stop going stale (cycle 2 still says 1 paid, KES 95).

4. **Repair chama Test now**
   - Reopen cycle 2's completion state, run the completion routine: create member 2's KES 190 payout, mark the cycle paid, correct its counters, and open cycle 3 with the next beneficiary and correct daily window.

5. **Verify**
   - Confirm the pool card shows the correct amount and 2/2 paid until payout, payout SMS/receipt goes out, cycle 3 opens, and re-running the paths creates no duplicate payout.
   - Re-check other active chamas for cycles stuck in the same `is_complete = true, payout_processed = false` state and heal them with the same routine.

## Technical scope

- Migration: drop the `is_complete` write from `trigger_immediate_payout`; update `get_chama_current_pool`; one-off data repair for the affected cycle.
- Edge functions: new `_shared` completion helper; wire into `contributions-crud`, `c2b-confirm-payment`, `payment-stk-callback`, `daily-payout-cron`.
- No changes to gross amounts, commission math, or payout ordering.
