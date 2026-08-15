# Fix Chama Cycle Advancement, Pool, and Payout Dates

## Confirmed findings

- The affected chama has only **cycle 1**. It ended and paid out KES 190 on 14 August, but **cycle 2 was never created**.
- User `0707874790` paid KES 200. The backend correctly allocated KES 100 gross to cycle 1 and stored the second KES 100 as **KES 95 net pending wallet credit** after the 5% commission.
- Because cycle 2 does not exist, that KES 95 cannot be applied to a cycle. The chama balance is therefore KES 0 after the KES 190 payout, and “Today’s Pool” reports no active cycle.
- The failure is in the immediate-payout paths used after all members pay: they close and pay cycle 1 directly but do not run the same next-cycle advancement used by the scheduled payout processor.
- The live payout-position function now calculates member 2 as **15 August**. The missing cycle still leaves the UI dependent on an estimate rather than the authoritative cycle-2 deadline.
- Frequency calculations are duplicated across several functions, and some monthly estimates use fixed 30/15-day arithmetic instead of the chama’s real calendar schedule. This can produce future drift.

## Implementation

1. **Make cycle completion advance atomically and idempotently**
   - Route online, offline/C2B, early, and scheduled payouts through one shared completion-and-advance flow.
   - After a payout is successfully created, always create the next cycle exactly once.
   - Treat “next cycle already exists” as success so retries cannot create duplicates or skip wallet allocation.
   - Return a consistent `cycleId` from cycle creation so every caller can verify advancement.

2. **Use one frequency-aware date engine**
   - Centralize daily, weekly, monthly, twice-monthly, and every-N-days boundaries.
   - Enforce 22:00 EAT deadlines and 00:01 EAT next-cycle starts.
   - For monthly/twice-monthly chamas, use configured calendar days rather than fixed 30/15-day estimates.
   - Update payout estimates to prefer actual cycle deadlines and use the same calendar engine only for future cycles.

3. **Apply carry-forward before exposing the new pool**
   - On cycle creation, create all member payment rows, then apply pending overpayment and late-payment credits FIFO.
   - Keep gross payment history unchanged; apply the already-deducted KES 95 net credit without charging commission again.
   - Remove the duplicate post-creation wallet application path that can double-count balances and contributions.
   - Make the current-pool query select the real current open cycle and its payment rows, with no fallback to a completed payout cycle.

4. **Repair the affected chama**
   - Create its missing cycle 2 for 15 August with member 2 as beneficiary.
   - Apply the pending KES 95 net wallet credit to member 2’s KES 100 gross cycle obligation.
   - Recompute the current pool and confirm it shows KES 95, 1/2 members paid, with no extra commission or duplicated totals.
   - Confirm the expected payout date shown for member 2 is 15 August at the configured EAT deadline.

5. **Regression checks**
   - Test immediate completion from online and offline payments, scheduled completion, and retry/idempotency behavior.
   - Test overpayment spanning the current and next cycle.
   - Test daily, weekly, monthly, twice-monthly, and every-N-days cycle boundaries across month ends.
   - Verify pool, member payment status, wallet status, chama balance, payout date, withdrawal, and financial ledger remain consistent.

## Technical scope

- Update the payout/payment functions and shared chama deadline/wallet helpers.
- Update the database payout-position/current-pool functions where needed.
- Add a safe backend migration for shared date/idempotency guarantees and the targeted data repair.
- Deploy the affected functions, run backend tests, and verify the affected chama in the live preview.