## Goal

Let a Mchango creator delete their own campaign once it has 0 days left. If the campaign still holds funds, those funds sweep to company revenue, and every such sweep (from campaigns or deleted user accounts) is tracked on a new Admin dashboard.

## 1. Database (single migration)

**New table `abandoned_funds_ledger`** — the single source of truth for money forfeited to the company from deletions.

Columns:
- `source_type` ('mchango' | 'welfare' | 'chama' | 'user_account')
- `source_id` (uuid, nullable — original entity may be gone)
- `source_name` (text — snapshot of title/name)
- `owner_user_id` (uuid, nullable), `owner_name`, `owner_phone`, `owner_email` (snapshots)
- `gross_amount`, `commission_taken`, `net_swept_to_revenue`
- `reason` ('creator_deleted_expired_campaign' | 'account_deleted_with_balance' | 'admin_deleted')
- `metadata` jsonb (campaign target, days_expired, related receipts)
- `swept_at`, `swept_by`
- Standard timestamps

Grants: `authenticated` SELECT-nothing (RLS locks it), `service_role` ALL. Only super_admin can read via policy `has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')`.

**RPC `sweep_mchango_to_revenue(p_mchango_id, p_reason)`** (SECURITY DEFINER):
- Locks the mchango row
- Reads `available_balance`
- Inserts a `company_earnings` row (type `abandoned_funds`) for the balance
- Inserts `financial_ledger` entry (transaction_type `abandoned_sweep`, gross=commission=amount, net=0 to satisfy integrity trigger — or use a dedicated type exempted from the check; will exempt `abandoned_sweep`)
- Inserts `abandoned_funds_ledger` row with snapshots
- Zeros `mchango.current_amount` and `available_balance`
- Returns the ledger row id

Adjust `validate_financial_ledger_integrity` to skip `abandoned_sweep`.

## 2. Edge function: `mchango-creator-delete`

New function (verify_jwt=false, in-code JWT validation like other admin funcs).

Input: `{ mchango_id, confirm_title }`

Flow:
1. Auth user; load mchango.
2. Assert `created_by = user.id`.
3. Assert `end_date <= now()` (0 days left / expired).
4. Assert `confirm_title.trim().toLowerCase() === title.trim().toLowerCase()`.
5. Block if any pending withdrawals exist.
6. If `available_balance > 0`: call `sweep_mchango_to_revenue`.
7. Hard-delete related rows the existing admin delete already handles (donations, transactions, payouts, withdrawals) then delete the mchango.
8. Notify creator (SMS + in-app) that campaign was deleted and, if applicable, the swept amount.
9. Log via `logAdminAction`-equivalent server-side write to `admin_action_log` with `actor=creator`.

## 3. Existing account-deletion flow

`self-delete-account` edge function (already exists per memory): before deletion, sum any remaining balances the user owns (wallet credits, unwithdrawn mchango/welfare/chama balances they solely control). For each non-zero balance, insert `abandoned_funds_ledger` row (`reason='account_deleted_with_balance'`) and route funds to `company_earnings`. Same treatment when an admin deletes a user with balances.

## 4. Frontend — creator delete UI

**`src/pages/MchangoDetail.tsx`** (creator view): when `end_date` has passed and viewer is creator, show a red "Delete Campaign" card.

Clicking opens an `AlertDialog`:
- If `available_balance > 0`, prominent amber warning: "This campaign still holds KES X. Deleting it will forfeit these funds to platform revenue. This cannot be undone."
- Text input: "Type the exact campaign title to confirm"
- Delete button disabled until input matches title (case-insensitive trim)
- On confirm: call `mchango-creator-delete`, toast result (including swept amount), navigate to `/mchango`.

## 5. Admin dashboard — Abandoned Funds page

**New route** `/admin/abandoned-funds` (super_admin + admin), sidebar entry under Financial section.

**New page `AdminAbandonedFunds.tsx`**:
- Summary cards: Total Swept (all-time), This Month, Count by reason
- Filters: source_type, reason, date range, search by owner name/phone
- Table: Date | Source (type + name) | Owner (name + phone) | Amount | Reason | Details drawer
- Details drawer shows metadata json, related receipts, original entity id
- CSV export button

Data via new edge function `admin-abandoned-funds-list` (paginated, super_admin/admin gated) or direct table query using RLS.

## 6. Safeguards

- Sweep runs inside a single transaction (RPC) so partial failure never leaves half-swept money.
- Duplicate protection: unique index `(source_type, source_id, reason)` where `source_id IS NOT NULL` to prevent double-sweep of the same entity.
- Never sweep if there are pending/processing withdrawals — surface a clear error to the creator.
- `abandoned_sweep` transactions excluded from user-facing reports.

## Technical notes

- Reuses existing patterns: `logAdminAction`, `SuperAdminProtectedRoute`, edge function auth pattern, Onfon SMS notifier, `AlertDialog` + typed-confirmation.
- No schema changes to `mchango`; only additive tables + RPC.
- Ledger integrity trigger updated to exempt `abandoned_sweep` (gross=amount, net=0, commission=amount is the semantic — full amount recognized as company revenue).
