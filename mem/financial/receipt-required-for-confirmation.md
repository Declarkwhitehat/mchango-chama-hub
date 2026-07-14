---
name: Receipt Required for Payment Confirmation
description: Platform-wide rule enforced by DB trigger — no payment across chama, welfare, mchango, or organization can be marked completed/confirmed without an M-Pesa receipt number
type: constraint
---
No payment row in `contributions`, `transactions`, `welfare_contributions`, `mchango_donations`, or `organization_donations` may be inserted or updated with `status`/`payment_status` = `completed`/`confirmed` unless `mpesa_receipt_number` is non-empty.

Enforced by trigger `enforce_receipt_on_completion` (BEFORE INSERT OR UPDATE) on each table. Exempt `payment_method` values (internal ledger moves): `wallet`, `overpayment_wallet`, `registration_credit`, `internal_credit`, `internal`, `credit`, `adjustment`. Already-completed rows are grandfathered — the guard only fires when transitioning INTO completed/confirmed.

**Why:** Prevent any deposit from being counted as paid without a real Safaricom receipt.

**How to apply:** Every new edge function or admin flow that writes a completed payment MUST supply `mpesa_receipt_number`. For manual/offline reconciliation, require the operator to enter the M-Pesa code. If receipt is unavailable, insert as `pending` and let the M-Pesa callback promote it.
