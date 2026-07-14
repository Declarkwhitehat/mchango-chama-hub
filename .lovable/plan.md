## Goal
Guarantee that no payment can ever be recorded twice across every payment surface (chama, welfare, mchango, organization, transactions, member cycle payments), whether it originates from STK Push, C2B paybill callback, manual/offline entry, or retry.

## Root causes of past duplicates
1. Rows inserted without an `mpesa_receipt` (pending/manual entries) later get re-inserted when the real callback arrives.
2. Callback handlers not always upserting on receipt — sometimes insert a fresh row.
3. Manual/offline confirmations don't check if the same receipt already exists in a sibling table.
4. Balance aggregates (`available_balance`, `current_amount`, `total_gross_collected`) can drift if a duplicate is later removed.

## Plan

### 1. Database-level hard guarantees (migration)
Enforce uniqueness so a duplicate physically cannot be inserted, even under race conditions.

- Confirm/repair **partial UNIQUE indexes** on `mpesa_receipt` where NOT NULL for:
  `contributions`, `welfare_contributions`, `mchango_donations`, `organization_donations`, `transactions`, `member_cycle_payments`, `financial_ledger`.
- Add a **global cross-table receipt guard**: new table `mpesa_receipt_registry(receipt text PRIMARY KEY, source_table text, source_id uuid, amount numeric, created_at timestamptz)` with GRANTs + RLS (service_role only).
- Add BEFORE INSERT triggers on each payment table that:
  - Reject insert if `mpesa_receipt` already exists in `mpesa_receipt_registry`.
  - Register the receipt atomically on successful insert.
- Add a **soft-duplicate guard** for rows without a receipt (offline/manual): unique partial index on `(entity_id, member_id, amount, date_trunc('minute', created_at))` where `mpesa_receipt IS NULL`, per table, to block accidental double-clicks.

### 2. Settlement engine / edge functions
- Standardize every payment-completing edge function to use **INSERT … ON CONFLICT (mpesa_receipt) DO NOTHING RETURNING id**, then only update balances when a row was actually inserted.
- Wrap balance updates in the existing `settlement_locks` pattern keyed by `mpesa_receipt` so concurrent callbacks (STK result + C2B confirmation for the same receipt) resolve to one settlement.
- On manual/offline "mark as paid" flows: require a receipt or generate a deterministic pseudo-receipt (`OFFLINE-<entity>-<member>-<yyyymmddhhmm>`) that flows through the same uniqueness pipeline.

### 3. Reconciliation & alerting
- Nightly cron function `duplicate-payment-scanner` that scans the last 30 days across all payment tables for:
  - same `mpesa_receipt` appearing in >1 row anywhere,
  - same `(member, amount, minute)` with NULL receipts >1,
  - orphan settlements (row exists but no ledger entry, or vice versa).
- Findings written to a new `payment_duplicate_alerts` table and pushed to super_admin via existing SMS/notification channel. No auto-delete — admins review.

### 4. Balance integrity
- Add a read-only DB function `recompute_welfare_balance(welfare_id)` (and chama/mchango equivalents) that recalculates `available_balance` from ledger, so any future manual correction uses a single trusted formula instead of ad-hoc UPDATEs.

### 5. Non-goals (won't touch)
- No changes to existing balances or historical rows.
- No deletions of any existing payment records.
- No UI/business-logic changes outside preventing duplicate submits (double-click debounce on payment buttons if not already present).

## Technical notes
- Migration order: create registry table + GRANTs + RLS + policies → backfill registry from existing NOT NULL receipts (INSERT … ON CONFLICT DO NOTHING) → add triggers → add partial unique indexes.
- Triggers use `SECURITY DEFINER` with `SET search_path = public`.
- All new tables service_role only; no anon/authenticated grants (internal integrity layer).
- Cron via `pg_cron` calling the existing edge-function invocation pattern.
