## What I found

- **Different pool amounts per user:** non-manager members can only read their own `member_cycle_payments`, so `CurrentCyclePool` undercounts the pool for regular members. Managers/admins see more rows, so they see different totals.
- **CLWXM0009 stale negative balance:** the real debt rows show CLWXM0009 still owes Cycle 4 and Cycle 5, but `chama_members.balance_deficit` is a stale stored value. Payments clear `chama_member_debts`, but the member dashboard still reads the stale column instead of recalculating from live debt/payment rows.
- **Pay-for-another failure:** the frontend calculates “what another member owes” differently from the backend validator. The UI skips already processed unpaid cycles, while the backend counts them, so the user sends too little and the online payment function rejects it.
- **Skipped payout display:** CLWXM0009 was skipped for Cycle 4, but the UI can still present payout progress too positively because it treats completed/processed cycles as “received” without clearly showing skipped/deferred status and actual paid amount.
- **Wrong “all members received” message:** `chama-cycle-complete` hardcodes “All members have received their payouts,” even when there were skipped/deferred members or unpaid deficits.
- **SMS inconsistency:** there are two SMS paths: some functions call the central transactional SMS service, while `daily-payout-cron` sends directly through a separate provider helper. Failures are not logged/queued consistently, so messages can silently fail.

## Implementation plan

1. **Make pool totals authoritative and identical for every member**
   - Add a backend read function that returns the current/open cycle pool using service-level access but only after confirming the caller is a valid chama member, manager, or admin.
   - Update `CurrentCyclePool` to use this function instead of reading `member_cycle_payments` directly.
   - Include paid count, total count, actual net pool, expected target, and current cycle id.

2. **Fix member debt/dashboard balances**
   - Update `get_member_dashboard` to compute live outstanding balance from:
     - unpaid `member_cycle_payments`
     - outstanding/partial `chama_member_debts`
     - pending deficit obligations
   - Stop relying on stale `chama_members.balance_deficit` for dashboard balance.
   - Add a small backend function to recompute and sync `balance_deficit`, `missed_payments_count`, and verification flags after every settlement.
   - Call this sync inside `contributions-crud` after debt settlement and current-cycle allocation.

3. **Fix pay-for-another online payments**
   - Reuse the same backend eligibility/outstanding function for both self-pay and pay-for-another.
   - Update `ChamaPaymentForm` so the prefilled amount exactly matches the backend minimum, including old unpaid processed cycles and debts.
   - Improve the payment error message to show the required amount if rejection still happens.

4. **Correct payout and skipped-member display**
   - Update payout tabs to show:
     - **Received** only when a withdrawal exists and is completed/processing for that member.
     - **Skipped / deferred** when `was_skipped`, `payout_skips`, or a redirected cycle exists.
     - **Actual received** from `contribution_cycles.payout_amount` / matching withdrawal `net_amount`, not theoretical full amount.
     - **Shortfall still owed** when deficits remain outstanding.
   - If a member expected KES 95 but received KES 79, show KES 79 received and KES 16 pending until late debt settlement completes.

5. **Keep debt settlement open after cycle completion**
   - Allow payments to settle outstanding chama debts even when the chama is `cycle_complete`.
   - Route late debt payments to the shortchanged recipient using the existing deficit-settlement withdrawal flow.
   - Keep showing payment UI when a cycle is complete **only if the member has outstanding debt**.

6. **Fix cycle-complete wording and reminders**
   - Update `chama-cycle-complete` to inspect actual payouts, skipped members, and outstanding deficits before messaging.
   - Use accurate messages:
     - all paid: “Cycle complete. All payouts completed.”
     - not all paid: “Cycle ended, but some payouts/debts are still pending.”
   - Send manager summary listing skipped/debtor members and outstanding amounts.
   - Send debtor reminders to clear debts after cycle completion.

7. **Unify SMS delivery**
   - Replace direct SMS helper calls in `daily-payout-cron` with the central `send-transactional-sms` function.
   - Add durable `sms_delivery_logs` records for success/failure so missing SMS can be traced.
   - Add retries for transient SMS gateway failures.
   - Keep SMS text GSM-safe and under practical length limits.

8. **Data repair for AMABUKO / CLWXM0009**
   - Run a safe backend data repair to recompute AMABUKO member balances from actual debt/payment rows.
   - Reclassify CLWXM0009’s displayed balance based on the two outstanding debt rows and current unpaid cycle rows.
   - Ensure cycle 5 / last-cycle state does not mark the chama as fully settled while outstanding debts remain.

## Technical changes needed

- Database migration:
  - New RPC for authoritative current pool.
  - New RPC/helper to recompute member debt summary.
  - Optional `sms_delivery_logs` table with secure access rules.
- Backend functions:
  - `contributions-crud`
  - `daily-payout-cron`
  - `chama-cycle-complete`
  - `payment-stk-push`
- Frontend:
  - `CurrentCyclePool.tsx`
  - `ChamaPaymentForm.tsx`
  - `MemberDashboard.tsx`
  - `ChamaDetail.tsx`

After approval, I’ll implement these fixes and then validate against AMABUKO / CLWXM0009 records directly.