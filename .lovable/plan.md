## What's wrong and what I'll do

### Bug 1 — CLWXM0009 balance is wrong (deficit drift, money-at-risk)

**Diagnosis (from the live DB for AMABUKO / CLWXM0009):**

- Gross paid by this member: 22 + 58 + 2 = **KES 82** → net 0.95 ≈ **KES 78** (this is what "Payment History total" displays — it's the NET).
- `chama_members.balance_deficit` says **KES 108**. Reality after recompute:
  - Cycle 1: paid 20 ✓ (1.9 overflow → wallet)
  - Cycle 2: debt cleared by 22 payment ✓ — but `member_cycle_payments` for cycle 2 was NEVER updated (still shows amount_paid=2). 
  - Cycle 3: debt cleared by 22 ✓ — but mcp still shows amount_paid=0.
  - Cycle 4: still owed 22 (20 + 2 penalty).
  - Cycle 5: wallet 13.3 net applied → mcp.amount_paid=14, BUT a new debt row was then accrued at deadline for the FULL 22 ignoring the wallet credit. → cycle 5 is double-counted.

**Root causes:**

1. The debt-settlement path updates `chama_member_debts` and decrements `balance_deficit` but does NOT update the corresponding `member_cycle_payments` row, so cycle history under-reports paid cycles.
2. The nightly debt-accrual cron creates a debt row equal to `contribution_amount` without subtracting whatever `member_cycle_payments.amount_paid` (incl. wallet credits) already covered → double counting.
3. `balance_deficit` is mutated incrementally from many paths, so drift accumulates.

**Fix:**

- Make debt settlement also UPDATE the matching mcp row (amount_paid, amount_remaining, fully_paid, paid_at, payment_allocations append).
- Make the debt-accrual cron compute `principal_debt = max(0, amount_due − amount_paid)` from mcp, not the full contribution amount. If mcp is already fully_paid, do NOT create a debt row.
- Replace ad-hoc `balance_deficit` mutations with a single canonical recomputation: `recompute_chama_member_balance(member_id)` (already exists) — call it at end of every settlement / wallet-application / debt-accrual / payout. Add a DB trigger on `member_cycle_payments` and `chama_member_debts` to auto-recompute.
- Run the recompute once now for CLWXM0009 and for every active AMABUKO member to clear the existing drift.
- "Payment History" totals: change the label from "Total: KES X" to "Total received (net): KES X" and add a second line "Total contributed (gross): KES Y" so the user sees both. Include payments where this member is the beneficiary (paid_by_member_id ≠ member_id) with a clear "Paid by &nbsp;" tag — they already exist in the `contributions` rows but the UI filter likely hides them.

**Pay-for-another attribution:** Yes, when member A pays for member B the row is stored as `contributions.member_id=B, paid_by_member_id=A`. The fix above makes sure B's payment history lists it (today the UI filters by `member_id=auth.user` AND `paid_by_member_id=auth.user`, so cross-pays are invisible to B). I'll switch the filter to `member_id=B` only and show the payer name when different.

### Bug 2 — Admin sees "Failed" but money was actually sent (and Retry sends it AGAIN)

**Diagnosis:** Found 3 live rows with `b2c_error_details.callback_result_desc = "The service request is processed successfully"` AND `status='failed'` because the DB function `process_withdrawal_completion` returned `Insufficient available balance for completion`. Safaricom already disbursed the cash; we refuse to mark complete because the chama's `available_balance` < amount at that moment. Admin then clicks Retry → b2c-payout fires another B2C → recipient is paid twice.

**Fix:**

1. **Never mark a successful Safaricom callback as `failed`.** When `resultCode === 0` from the B2C callback, the money is gone — the only correct outcome is `completed`. Rewrite `process_withdrawal_completion` to:
  - Always set status=completed + record receipt when called from a successful callback.
  - If `available_balance < amount`, still deduct (allow negative or clamp to 0) and insert a row in a new `withdrawal_reconciliation_alerts` table + notify admins. Never return "Insufficient balance" on a successful callback.
2. **Guard the Retry button.** In `WithdrawalsManagement` and the `retry-failed-payouts` cron, refuse to retry any withdrawal whose notes/b2c_error_details indicate Safaricom returned ResultCode 0 OR that already has a ConversationID. Instead show "Reconcile" which calls `b2c-status-query` and, if successful at Safaricom, force-completes via the rewritten RPC.
3. **Backfill:** Run a one-off repair script that finds withdrawals with `status='failed'` AND `b2c_error_details->>'callback_result_code' = '0'`, force-completes them, and (where retries already fired) flags the duplicates for admin review.

### Bug 3 — Safaricom signup rejected for valid prefixes

Current `SAFARICOM_PREFIXES` in `src/pages/Auth.tsx` line 50 = `['70','71','72','74','75','76','79','110','111']`. This rejects 0112-0115 and incorrectly accepts non-Safaricom 0744/0747-0749 etc.

**Fix:** Replace with exact validator matching your ranges. Local 9-digit number after stripping +254 must match one of:

- starts with 70, 71, 72, 79 (covers 0700–0729, 0790–0799)
- starts with 740, 741, 742, 743, 745, 746 (covers 0740–0743, 0745–0746)
- starts with 110, 111, 112, 113, 114, 115 (covers 0110–0115)
Plus keep 75, 76 if you want — please confirm (your list excluded them, but they ARE Safaricom). I'll default to **excluding 75/76** per your message; toggle if you want them in.

I'll centralize this in `src/utils/phoneUtils.ts` as `isSafaricomNumber()` and reuse it in Auth, profile updates, payment-method add forms, and the welfare/withdrawal recipient validators — so the rule lives in one place.

## Technical changes (files)

- DB migration:
  - Rewrite `process_withdrawal_completion` (no "insufficient balance" failure on successful callback; logs alert).
  - New `withdrawal_reconciliation_alerts` table + RLS for admins.
  - Update `recompute_chama_member_balance` to also resync mcp from cleared debts.
  - Trigger on `chama_member_debts` UPDATE/INSERT and on `member_cycle_payments` UPDATE to call recompute.
  - Daily debt-accrual function: skip if mcp.fully_paid, else principal = amount_due − amount_paid.
- Edge functions:
  - `b2c-callback`: on resultCode=0, never write status='failed'.
  - `retry-failed-payouts` + `b2c-payout`: refuse retry when prior callback ResultCode=0 or ConversationID exists; trigger status-query instead.
  - `chama-debt-settlement` (or wherever debts are cleared): update mcp atomically.
- Frontend:
  - `src/pages/Auth.tsx`: import new `isSafaricomNumber` from `phoneUtils`.
  - `src/utils/phoneUtils.ts`: add `isSafaricomNumber` with the exact ranges above.
  - Payment History component: drop the `paid_by_member_id` filter, show "Paid by X" badge, show gross + net totals.
  - `WithdrawalsManagement` admin UI: hide Retry when callback was successful; show "Reconcile" + warning banner.
- One-off data repairs (executed after migration):
  - Recompute balances for all AMABUKO members.
  - Force-complete the 3 falsely-failed deficit-settlement withdrawals and notify admins of any duplicate retries.

## Open question

Do you want **0750–0759 and 0760–0769** accepted at signup? They are Safaricom but were not in your list. I'll exclude by default unless you say otherwise. Include all safaricom numbers