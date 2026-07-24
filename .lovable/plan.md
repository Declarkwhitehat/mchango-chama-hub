## Goal
When a welfare member misses the 5-day registration deadline and is removed as `removed_unpaid`, any later payment they make should count toward the registration fee. Once their cumulative payments (existing credit + partial + new payment) reach the required fee, auto-reinstate them as a confirmed active member.

## Current behavior
- On expiry, `welfare-registration-reminder-cron` moves `registration_fee_paid` into `welfare_registration_credits`, sets `status='removed'`, `registration_status='removed_unpaid'`.
- `apply_welfare_registration_payment` RPC only allocates to members whose `registration_status` is `pending`/`partial`. Payments from a removed member's phone/account currently fall through to normal contribution logic or become unmatched.

## Changes

### 1. Update `apply_welfare_registration_payment` RPC (migration)
- Extend lookup to also match members with `registration_status='removed_unpaid'` (in addition to `pending`/`partial`).
- For a removed_unpaid member:
  - Pull any prior `welfare_registration_credits` rows for that user+welfare and treat them as already-paid toward the fee (consume/mark them used).
  - Add the incoming payment on top.
  - If `credits + prior partial + new payment >= registration_fee`:
    - Reinstate: set `status='active'`, `registration_status='confirmed'`, `registration_fee_paid = registration_fee`, clear `registration_deadline` (or extend as needed).
    - Extract 5% commission → `company_earnings`, 95% → `welfares.available_balance` with ledger row `category='registration_fee'`.
    - Any surplus above the fee flows into the normal contribution allocation (existing downstream logic).
    - Send confirmation SMS + push + in-app notification: "You have been reinstated in {welfare}."
  - If still short: update `registration_fee_paid`, keep `registration_status='removed_unpaid'` but log the partial top-up as an additional credit row (so future payments continue to accumulate). No reinstatement yet.

### 2. C2B / STK matching
- `c2b-confirm-payment` and STK confirmation already resolve members by `member_code` (including fuzzy match). Ensure they do NOT skip rows where `status='removed'` when the row's `registration_status='removed_unpaid'` — only for the registration-fee allocation path. Normal contribution logic still ignores removed members.

### 3. Notifications
- On successful auto-reinstatement: SMS from PAMOJANOVA — "Welcome back to {welfare}. Your registration fee of KES {fee} is fully paid. You are now an active member." Plus push + in-app.
- No SMS on partial top-up (avoid spam); existing daily reminder cron already covers pending balances — extend it to include `removed_unpaid` members so they get reminded their partial credit is still held.

### 4. Memory update
- Update `mem://welfare/registration-fee-policy.md` to document auto-reinstatement: removed_unpaid members are auto-restored once cumulative payments reach the fee.

## Out of scope
- No UI changes to the welfare detail page — reinstatement is fully automatic on payment callback. Member reappears in the active list on next refresh.
- No changes to the 5-day deadline itself.

## Technical notes
- Reinstatement happens inside the RPC so it's atomic with the payment write and idempotent per M-Pesa receipt (existing `mpesa_receipt_registry` uniqueness prevents double credit).
- Credits are consumed by marking rows (add a `consumed_at` column via migration) rather than deleted, preserving audit trail.
