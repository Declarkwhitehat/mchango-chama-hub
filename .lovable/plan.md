## Problem

The system currently has two independent payment paths that can both finalize the same M‑Pesa transaction:

**Inbound (contributions / donations):**
- Auto: `payment-stk-callback` and `c2b-confirm-payment` write `completed` rows keyed on `mpesa_receipt_number`.
- Manual / admin: there is no current "mark as paid" UI for contributions, but admins can insert via SQL, and re-allocation is described as a future workflow.

**Outbound (withdrawals / payouts):**
- Auto: "Send via M‑Pesa" → `b2c-payout` → `b2c-callback` → `process_withdrawal_completion` (atomic) marks `status='completed'`.
- Manual: `WithdrawalsManagement.handleMarkAsManuallyPaid` calls `withdrawals-crud` PATCH with `status='completed' + payment_reference=…`. **Right now this works on ANY non‑completed/non‑rejected status — including `processing` (B2C in flight) and `pending_retry`.** This is the actual double‑payment risk: an admin marks a withdrawal "manually paid" while the B2C payout is mid‑flight, then the B2C callback also debits the entity → the recipient gets paid twice and the group is debited twice.

The same hole exists on the inbound side: if we ever add a "manual confirm contribution" button, an admin could record a payment whose receipt is already in‑flight from STK/C2B.

## Goal

Enforce, in the database and in every entry point: **a transaction reaches `completed` exactly once, through exactly one channel.** Auto and manual paths must be mutually exclusive and idempotent.

## Changes

### 1. Withdrawals: lock manual completion against in-flight automatic payouts

In `supabase/functions/withdrawals-crud/index.ts` (PATCH branch, around the `isManualCompletion` block):

Before applying a manual `status='completed' + payment_reference`, fetch the current row and reject if any of these are true:
- `status` ∈ (`processing`, `pending_retry`) → B2C is in flight or queued for retry. Force admin to either wait for the callback or run a B2C status query first.
- `status === 'completed'` → already done.
- `b2c_attempt_count > 0 AND last_b2c_attempt_at` within the last 60 minutes AND `status !== 'failed'` → recent automatic attempt without a final result; require admin to mark the withdrawal `failed` first (existing flow already does this on retries exhausted / permanent fail).
- An existing withdrawal row already has `mpesa_receipt_number = payment_reference` (cross-row duplicate).

Return a clear 409 with reason. The UI surface (`WithdrawalsManagement.tsx`) shows the error toast and disables "Mark Paid" while `status` is `processing` / `pending_retry`.

Add a unique partial index (already partially present per memory): ensure `withdrawals.mpesa_receipt_number` is `UNIQUE` where not null, so two completions with the same M‑Pesa receipt can never coexist.

### 2. Withdrawals: lock automatic completion against an existing manual completion

In `supabase/functions/b2c-callback/index.ts` (success branch, before calling `process_withdrawal_completion`):

- Idempotency check is already done for `status === 'completed'`. Extend it to also check:
  - If `payment_reference` already starts with something other than `WD-` (i.e. an admin already wrote a manual ref) AND `status === 'completed'`, **do not** call `process_withdrawal_completion`. Just log "manual completion already recorded; suppressing duplicate B2C credit" and exit. This already happens because of the `completed` check, but we add the explicit branch + audit log so it's visible.
- If the same `mpesa_receipt_number` is found on **another** withdrawal row, reject with audit log (the unique index will enforce this; we just want a friendly log).

Also harden `process_withdrawal_completion` (DB function): make it a no‑op when row is already `completed`, and make the entity balance update idempotent (only deduct if `completed_at IS NULL` at the moment of update). This prevents a double-debit if both paths somehow race.

### 3. Contributions / donations: enforce single channel for inbound

`payment-stk-callback` and `c2b-confirm-payment` already deduplicate by `mpesa_receipt_number`. Strengthen this:

- Add `UNIQUE` index on `mpesa_receipt_number` for each table (`contributions`, `welfare_contributions`, `mchango_donations`, `organization_donations`, `saving_deposits`) where not null. Any concurrent insert with the same receipt fails at the DB layer.
- In both callbacks, treat the duplicate-key error as success-no-op (idempotent).
- Pre-create pending rows already use `payment_reference = CheckoutRequestID`. When the callback resolves, update the row in place — never insert a second row.

### 4. Admin "manually allocate unmatched payment" workflow (preventive)

For unmatched C2B payments (the path at `c2b-confirm-payment` line ~944, plus the future workflow accessed from `AdminMpesaSearch`): if/when an admin manually allocates an unmatched payment to a member/campaign, the manual allocate endpoint MUST:
- Look up the M‑Pesa receipt across all transaction tables.
- Refuse to insert if the receipt already exists anywhere with `status='completed'`.
- Mark the source row as `manually_allocated_by + manually_allocated_at` so the audit trail shows it came from the manual path.

(No new endpoint is required by this task; we add the guard preemptively in `c2b-confirm-payment`'s duplicate detection so it covers the admin‑initiated insertion path too.)

### 5. UI guards

`src/components/admin/WithdrawalsManagement.tsx`:
- Hide the "Mark Paid" form entirely when `status` is `processing`, `pending_retry`, or `completed`.
- For `failed` status, keep "Mark Paid" available (admin paid out of band after a confirmed B2C failure).
- Show a clear banner: "Automatic payout in progress — wait for callback or mark as failed first."

### 6. Audit + memory

- Insert an `audit_logs` row whenever a manual completion is rejected because of an in-flight auto attempt (and vice versa).
- Add a memory `mem://financial/auto-vs-manual-payment-mutex` documenting: never finalize the same M‑Pesa receipt through more than one channel; manual completion blocked while `processing` / `pending_retry`; DB unique indexes enforce it.

## Files to change

- `supabase/functions/withdrawals-crud/index.ts` — add status guard + duplicate-receipt guard before manual completion.
- `supabase/functions/b2c-callback/index.ts` — add explicit "manual already completed" branch + audit log.
- `supabase/functions/c2b-confirm-payment/index.ts` — keep duplicate detection, surface clearer error reason.
- `supabase/functions/payment-stk-callback/index.ts` — same.
- New migration:
  - `UNIQUE` partial indexes on `mpesa_receipt_number` for `withdrawals`, `contributions`, `welfare_contributions`, `mchango_donations`, `organization_donations`, `saving_deposits` (where not already enforced).
  - Update `process_withdrawal_completion` to no-op when already completed and to deduct balance only on first completion.
- `src/components/admin/WithdrawalsManagement.tsx` — disable manual mark-paid for in-flight statuses, show banner.
- `mem://financial/auto-vs-manual-payment-mutex` — new memory entry; update `mem://index.md`.

## Acceptance

- Admin clicks "Send via M-Pesa" → withdrawal goes to `processing`. While `processing`, the manual "Mark Paid" form is disabled in the UI; the API rejects manual completion with 409.
- B2C callback arrives → withdrawal completes once; entity balance debits once.
- Same M‑Pesa receipt cannot exist twice in any contribution/donation/withdrawal table (DB unique index).
- Replaying any callback (auto or manual) is a safe no-op.
