## Scope

Complete the three deferred edge-function pieces from the previous turn, plus a small welfare test helper so you can verify the registration flow on "The chachas" without recreating it.

## A. Welfare: enable a test fee on "The chachas" (quick)

1. Direct DB update: `welfares.registration_fee = 100` for `The chachas`.
2. Reset your own `welfare_members` row on that welfare to `registration_status='pending'`, `registration_fee_due=100`, `registration_fee_paid=0`, `registration_deadline = now()+5d`.
3. You then refresh `/welfare/<id>` and see the amber `PendingMemberView`, get the join SMS via Onfon, and can test the STK / Paybill flow.

(No code change — just two SQL operations.)

## B. Chama late-payment formula migration (big change)

### New invariant
For every late cycle on base contribution `C`:
```
member pays gross  = C * 1.10
penalty            = C * 0.10  → company_earnings  (category 'chama_late_penalty')
commission         = C * 0.05  → company_earnings  (category 'chama_commission')
net to chama pool  = C * 0.95
```
On-time math (`C` flat, 5% deductive) is unchanged.

### Files to update (single PR)

1. **`src/utils/commissionCalculator.ts`** — already has `calculateLatePayment(C)` helper from the previous turn; verify `calculateAmountToPay` returns `totalPayable = (onTimeCycles * C) + (lateCycles * C * 1.10)` and exports a flag UI can read.
2. **`src/components/chama/AmountToPayCard.tsx` + `NextPaymentTimer.tsx` + `PaymentCountdownTimer.tsx`** — show the inflated `totalPayable` and a "Includes KES X late penalty" sub-line.
3. **`src/components/ChamaPaymentForm.tsx`** — STK push `amount` must equal the new `totalPayable` (1.10 × C per late cycle).
4. **`supabase/functions/contributions-crud/index.ts`** — rewrite both late branches (lines ~240-260 and ~510-625):
   - Split `commission = toApply * 0.10` into `penalty = base * 0.10` (recorded as category `chama_late_penalty`) + `commission = base * 0.05` (category `chama_commission`).
   - `net = toApply - penalty - commission` (= `base * 0.95`).
   - `member_cycle_payments.amount_paid` stores `base` (so "1 cycle paid" semantics remain).
   - After computing net, call new helper `settleChamaShortfall(supabase, chama_id, net)` → FIFO over `chama_payout_shortfalls`, deduct from net, then credit leftover to `chama.available_balance`.
5. **`supabase/functions/c2b-confirm-payment/index.ts`** (chama branch, lines 116-235) — already delegates to `contributions-crud settle-only`. Only change: pass an explicit `is_late_hint` so the local `commissionAmount` in the `contributions` insert reflects the new split for the receipt PDF.
6. **`supabase/functions/daily-payout-cron/index.ts`** — at payout time:
   - Expected pool = `active_members * C * 0.95`.
   - If `chama.available_balance < expected`, insert `chama_payout_shortfalls` row (`shortfall_amount = expected - actual`, `status='pending'`).
   - Pay out whatever exists (existing behaviour).
   - On subsequent late payments, the FIFO helper from §4 settles via B2C top-up by invoking `b2c-initiate` with `purpose='chama_late_topup'` and idempotency key `cycle_id|mpesa_receipt`.
7. **`supabase/functions/b2c-result/index.ts`** — on success for purpose `chama_late_topup`, update `chama_payout_shortfalls.settled_amount`, set `status='settled'` when fully covered, store `b2c_transaction_id`, send beneficiary SMS: `"KES X late top-up from {member_code} received. M-Pesa {receipt}."`.

### New shared helper

`supabase/functions/_shared/chamaShortfall.ts`:
```ts
export async function settleChamaShortfall(
  supabase, chamaId, netAvailable, sourceReceipt
): Promise<{ toPool: number; toppedUp: number }>
```
Uses RPC `claim_chama_shortfall_for_settlement` (already created in the prior migration) and invokes `b2c-initiate` for each claim.

### Admin visibility (small)

- `src/pages/AdminTransactions.tsx` — add `Late top-up` filter chip (reads `b2c_transactions.purpose='chama_late_topup'`).
- `WelfareTransactionLog`-style component for chama executives showing pending shortfalls.

### Memory

- Update `mem://chama/late-payment-formula` with the final split, shortfall flow, and the B2C purpose code.

## C. Out of scope (explicit)

- On-time math, frozen-member logic, welfare math, STK push limits, deadlines — untouched.
- No change to `c2b-confirm-payment` welfare or mchango branches.
- No retroactive re-pricing of already-settled late payments.

## Risk callouts

- **Idempotency**: every `b2c-initiate` call must include a unique `originator_conversation_id = cycle_id|mpesa_receipt|shortfall_id` to survive callback retries.
- **Pool double-count**: net from a late payment must NEVER be added to `chama.available_balance` before the shortfall claim returns — otherwise we'd both top up the prior beneficiary AND inflate the current pool.
- **Member-facing display**: AmountToPayCard must update in the same release as the STK amount, otherwise users will be charged 1.10× while seeing 1.0×.

## Approval needed

Reply **"go"** to execute A+B+C as a single deploy, or **"only A"** if you want to just unblock welfare testing first and defer the chama refactor.
