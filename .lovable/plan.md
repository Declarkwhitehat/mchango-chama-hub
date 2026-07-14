## Policy: No Receipt = No Confirmation

Enforce site-wide that a payment can only be marked `completed`/`confirmed` when a valid M-Pesa receipt number is attached. Applies to Chama, Welfare, Mchango (campaigns), and Organization donations.

### Scope

All contribution/donation tables:
- `contributions` (chama)
- `member_cycle_payments` (chama cycles)
- `welfare_contributions`
- `mchango_donations`
- `organization_donations`
- `transactions` (STK ledger)

### Enforcement layers

**1. Database (hard guard, migration)**
- Add a trigger `enforce_receipt_on_completion()` on each table above.
- Rule: if `NEW.payment_status` (or `status`) transitions to `completed`/`confirmed`, then `mpesa_receipt_number` (or equivalent receipt column) must be NON-NULL and non-empty. Otherwise `RAISE EXCEPTION 'Payment cannot be confirmed without an M-Pesa receipt'`.
- Exception whitelist: rows where `payment_method = 'wallet'` (internal overpayment-wallet applications) and `payment_method = 'registration_credit'` — these are internal ledger moves, not deposits. Confirm with user if these should also require a receipt.
- Trigger fires BEFORE INSERT OR UPDATE.

**2. Edge functions (soft guard, fail fast)**
Audit and patch every function that writes a `completed` row:
- `mpesa-callback` / `payment-callback` — already sets receipt from Safaricom `MpesaReceiptNumber`; add explicit guard: if missing, mark `failed` instead of `completed`.
- `welfare-contributions` — currently inserts `payment_status: 'completed'` with only `payment_reference`. Change to insert `pending` unless a real receipt is provided; the M-Pesa callback flips to `completed` once the receipt lands.
- `chama-contributions`, `mchango-donate`, `organization-donate`, offline-payment reconciliation functions — same pattern.
- Admin "Force Confirm" / manual reconciliation paths must require an operator-entered receipt number (M-Pesa code) before flipping status.

**3. Admin UI**
- Any "Mark as paid / Confirm / Force approve" button requires a receipt number input (M-Pesa code, e.g. `TGH…`); disabled until filled.
- Display receipt on all payment lists; rows without a receipt render as `Pending` even if a legacy record says otherwise.

**4. Backfill / cleanup**
- One-time report (no auto-mutation) of existing `completed` rows across the 5 tables with NULL/empty receipt. Present count per table so the user decides whether to downgrade to `pending`, delete, or grandfather them.

### Open questions before I build

1. Should `payment_method IN ('wallet','registration_credit','offline_manual')` be exempt from the receipt rule, or must every confirmed row have a receipt (even internal wallet transfers)?
2. For existing legacy `completed` rows without receipts — grandfather them (rule applies only to new rows), downgrade to `pending`, or just report and let you decide manually?

I'll wait for these two answers, then ship the migration + edge-function patches + admin UI guard in one pass.
