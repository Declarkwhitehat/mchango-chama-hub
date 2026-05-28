---
name: Welfare Registration Fee Policy
description: Optional welfare registration fee with 5-day deadline, dual-approval changes, partial-credit ledger, and daily reminders.
type: feature
---
**Setting**: Welfare creators can set `registration_fee` (KES 0-100,000) at create time. Fee changes require dual-approval (any two of Chairman / Secretary / Treasurer) via `welfares.registration_fee_pending` + `registration_fee_change_requested_by/at` mirror of withdrawal pattern. Requester cannot self-approve.

**Member lifecycle**:
- Join with fee > 0 → `registration_status='pending'`, `registration_fee_due=fee`, `registration_deadline=now+5d`. Any prior `welfare_registration_credits` row for this user is consumed.
- Partial payment → `registration_status='partial'`. Full payment → `'confirmed'`.
- Past deadline unpaid → daily cron moves any `registration_fee_paid` into `welfare_registration_credits` and sets `status='removed'`, `registration_status='removed_unpaid'`.

**Payment allocation**: Inbound C2B / STK payments call RPC `apply_welfare_registration_payment`. Outstanding registration fee is allocated FIRST: 5% → `company_earnings`, 95% → `welfares.available_balance` (ledger row with `category='registration_fee'`). Remainder flows to normal contribution.

**Withdrawal gate**: A member with `registration_status != 'confirmed'` cannot be selected as withdrawal/payout recipient. UI in `WelfareWithdrawalRequest.tsx` enforces; edge function also rejects.

**Notifications**:
- Join SMS + push: Paybill 4015351 + member_code + amount + 5-day deadline.
- Daily 09:00 EAT cron (`welfare-registration-reminder-cron`) — SMS + push for every `pending`/`partial` member with remaining balance; removal SMS when expired.
- New contribution cycle (`welfare-cycles` POST) — SMS + push to every active confirmed member with amount, Paybill 4015351, member_code, deadline.

**Cron**: pg_cron scheduled `welfare-registration-reminders-daily` at `0 6 * * *` UTC (09:00 EAT) hitting `welfare-registration-reminder-cron`.
