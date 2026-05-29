## Part A — Welfare: pending-member gating + 10% commission on registration

### Backend
1. **`welfare-contributions` RPC `apply_welfare_registration_payment`** (migration): change commission split for the registration portion only — 10% → `company_earnings` (category `welfare_registration`), 90% → `welfares.available_balance`. Normal welfare contributions stay 5%.
2. **`welfare-crud` PUT (fee change)**: keep existing dual-approval flow; same 10% rate applies when the approved fee is later paid.
3. **`welfare-members` join**: unchanged — already creates `pending` member with 5-day deadline.

### Frontend — `WelfareDetail.tsx` pending-member view
When the viewer's own `registration_status` is `pending` or `partial`, replace the full detail layout with a restricted view:
- **Title bar** — "Complete registration to join {welfare name}"
- **Tabs visible only**: `Pay Registration` (default), `About`, `Documents`
  - Pay Registration: amber card with live **5-day countdown** to `registration_deadline`, amount due (`fee_due − fee_paid`), Paybill 4015351 + member_code, "Pay Now" STK button, partial-payment progress bar
  - About: welfare name, description, rules, executives, contribution amount/frequency (read-only)
  - Documents: existing `GroupDocuments` component, read-only
- **Hide**: contributions tab, withdrawals tab, members list, chat, executive panel, cycle status
- On status transition to `confirmed` (realtime or refetch after payment), automatically unlock the full layout

### Member commission display
Update `WelfareExecutivePanel` registration-fee row to label "10% platform commission (vs 5% on contributions)".

## Part B — Chama late payment: 110% gross + penalty + shortfall top-up

### New math (single source of truth)
For a late payment on base contribution `C`:
```
gross_due       = C * 1.10
penalty         = C * 0.10  →  company_earnings (category 'chama_late_penalty')
post_penalty    = C * 1.00
commission      = C * 0.05  →  company_earnings (category 'chama_commission')
net_to_pool     = C * 0.95
```

### `src/utils/commissionCalculator.ts`
- Keep `CHAMA_LATE_COMMISSION_RATE = 0.10` semantics but document it as the **penalty rate on top of base**, not a deductive commission.
- Add helper `calculateLatePayment(C)` returning `{ grossDue, penalty, commission, netToPool }`.
- Rewrite `calculateAmountToPay` so for late cycles: `lateBase = missedCycles * C * 1.10`; `lateCommission` is split into `latePenalty + lateBaseCommission`; `totalPayable` becomes `(onTimeCycles + lateCycles*1.10) * C`.
- Update `getChamaCommissionInfo` to accept an `isLate` flag and return the correct split.

### Edge functions that compute or apply late payments
Update each to use the new helper:
- `daily-cycle-manager` (carry-forward credit math uses net 0.95 — already correct for late, but needs `isLate` branch)
- `daily-payout-cron` (debt accrual & settlement: per-cycle `amount_due` for late = `C*1.10`, net to pool = `C*0.95`)
- `c2b-confirm-payment` & `contributions-crud` (chama branch): when allocating an inbound payment to a late cycle, deduct penalty first → `company_earnings`, then 5% commission → `company_earnings`, then credit `C*0.95` to `chama.available_balance`.
- `chama_overpayment_wallet` deposits from late payments store the **net 0.95C** (already net of both penalty + commission).

### Shortfall settlement (new)
1. **Migration — `chama_payout_shortfalls` table**
   ```
   id, chama_id, cycle_id, beneficiary_member_id,
   shortfall_amount, settled_amount DEFAULT 0,
   status ('pending'|'settled'), b2c_transaction_id,
   created_at, settled_at
   ```
   Grants for authenticated (read own chama) + service_role; RLS via `has_chama_membership`.
2. **At payout time** (`daily-payout-cron`): if the cycle pool < expected (`active_members * C * 0.95`), insert a `chama_payout_shortfalls` row for the cycle's beneficiary with `shortfall_amount = expected − actual_pool`. Beneficiary still receives whatever pool exists now (existing behaviour).
3. **On late payment landing** (extend the chama allocation path in `c2b-confirm-payment` / `contributions-crud`):
   - After computing `net_to_pool = C*0.95` for the late cycle, run FIFO over `chama_payout_shortfalls WHERE chama_id=? AND status='pending'`.
   - For the oldest unsettled shortfall, route up to `min(net_to_pool, remaining_shortfall)` directly to a **B2C top-up** to that beneficiary (reuse existing `b2c-initiate` function). Only the leftover, if any, flows into `chama.available_balance` for the current/upcoming cycle.
   - Update `settled_amount`; mark `settled` when fully covered. Record `b2c_transaction_id` & send beneficiary SMS: "KES {amt} top-up from late payment by {member_code}."
4. **Idempotency**: include `cycle_id + late_payment_receipt` in a unique key on the B2C request to prevent duplicate top-ups on retry.

### Admin visibility
- New row on `AdminWithdrawals` / `AdminTransactions` filter chip: `Late top-up`.
- `WelfareTransactionLog`-style component for chama showing pending shortfalls (executive-only).

### Out of scope (explicit)
- Frozen-member logic untouched.
- On-time payment math untouched (still 5% deductive).
- Welfare contribution math untouched (5%).
- Existing carry-forward wallet flow untouched except late deposits now store net 0.95C.
- No changes to STK push limits, deadlines, or freeze policy.

### Memory updates after build
- `mem://welfare/registration-fee-policy` — add 10% commission note + pending-member restricted view.
- `mem://chama/late-payment-formula` (new) — 110% gross, penalty + commission breakdown, FIFO B2C shortfall top-up.
