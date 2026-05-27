## Welfare Registration Fee + Contribution Notifications

### 1. Schema changes (single migration)

`welfares` — add columns:
- `registration_fee numeric NOT NULL DEFAULT 0`
- `registration_fee_pending numeric` + `registration_fee_change_requested_by uuid` + `registration_fee_change_approved_by uuid` + `registration_fee_change_requested_at timestamptz` (dual-approval mirror of withdrawal flow)

`welfare_members` — add columns:
- `registration_fee_due numeric NOT NULL DEFAULT 0`
- `registration_fee_paid numeric NOT NULL DEFAULT 0`
- `registration_status text NOT NULL DEFAULT 'confirmed'` — values: `pending` | `partial` | `confirmed` | `removed_unpaid`
- `registration_deadline timestamptz`
- `registration_first_reminder_at timestamptz`

New table `welfare_registration_credits`:
- `welfare_id`, `user_id`, `amount numeric`, `created_at`, `consumed_at`
- Holds forfeited partial payments; auto-applied if same user rejoins.

Backfill: all existing members → `registration_status = 'confirmed'`, `registration_fee_due = 0`.

### 2. Edge function changes

**`welfare-crud`** (POST create / PATCH update)
- Accept `registration_fee` on create (≥0, ≤100,000).
- On update: if `registration_fee` changes, write to `registration_fee_pending` + requester; second different executive (Chairman / Secretary / Treasurer) approving applies it. Mirror existing executive-change pattern.

**`welfare-members`** (POST join)
- Read welfare `registration_fee`.
  - If 0 → existing behavior (confirmed immediately).
  - If >0 → insert member with `registration_status='pending'`, `registration_fee_due=fee`, `registration_deadline = now()+5 days`. Apply any existing `welfare_registration_credits` row for this user (consume row, set `registration_fee_paid`, recompute status: confirmed if ≥ due, else partial).
- Send SMS+push: "Welcome to <welfare>. Pay KES <fee> via Paybill 4015351, Account <member_code> within 5 days to activate membership."

**`welfare-contributions-crud`** + **`c2b-callback`** welfare branch
- When a payment lands and payer's member row is `pending`/`partial`:
  - Allocate up to outstanding `registration_fee_due - registration_fee_paid` to registration first.
  - Of that allocated chunk: 5% → `company_earnings` (commission), 95% → `welfares.available_balance` (treat like contribution; create a `welfare_contributions` row with `category='registration_fee'` for ledger).
  - Update `registration_fee_paid`. If fully paid → `registration_status='confirmed'`, send confirmation SMS+push.
  - Remainder of payment flows to normal welfare contribution.
- Add `category` column to `welfare_contributions` (default `'contribution'`).

**Withdrawal gate**
- `welfare-withdrawal-crud` + payout selection: reject if requesting member's `registration_status != 'confirmed'`. Error: "Complete your registration fee to receive payments."

**New cron: `welfare-registration-reminder-cron`** (daily 09:00 EAT)
- For each `pending`/`partial` member where `registration_deadline > now()`: send SMS + push with remaining amount, Paybill 4015351, member_code, deadline.
- For each `pending`/`partial` past deadline:
  - Move `registration_fee_paid` (if >0) → `welfare_registration_credits` row.
  - Set `registration_status='removed_unpaid'`, `status='removed'`.
  - Send removal SMS+push.
- Schedule via pg_cron (`select cron.schedule`) calling the function URL.

**`welfare-contribution-cycle-manager`** (set new contribution)
- After a Secretary sets a new contribution amount/cycle: SMS + push every active confirmed member: "<welfare>: new contribution KES <amount>. Pay via Paybill 4015351, Account <member_code>. Deadline <date>." Skip `pending`/`partial`/`removed`.

### 3. Frontend changes

**`WelfareCreate.tsx`** — add `Registration Fee (KES)` numeric input (default 0, help text "Charged once when new members join. Leave 0 to disable.").

**`WelfareExecutivePanel.tsx`** (or settings dialog) — "Registration Fee" row with current value + Edit. Edit submits change request; banner shows "Pending approval from second executive". Second executive sees Approve/Reject.

**`WelfareDetail.tsx`** — for own member row when `registration_status != 'confirmed'`:
- Amber alert card: amount due, paid, remaining, deadline, Paybill 4015351 + member_code, "Pay Now" → STK push (reuses `WelfareContributionForm` prefilled with remaining fee).
- Hide withdrawal request button.
- In members list, badge "Pending registration" next to such members; executives see them but they're excluded from payout candidates.

**`WelfareJoin.tsx` / `WelfareList.tsx` join flow** — after successful join, if fee>0 show toast "Registration fee KES X required within 5 days" and navigate to detail page.

### 4. Memory updates

New mem file `mem://welfare/registration-fee-policy` summarizing rules; add reference to `mem://index.md` under Welfare Features.

### Out of scope
- No refund-to-M-Pesa on removal (credit ledger only, per choice).
- No change to existing welfare contribution math, withdrawal multi-sig, or commission rate.
