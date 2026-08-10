---
name: Welfare Loans
description: Two welfare loan products (3x multiplier, 75% shares), charges, eligibility, approvals, disbursement and repayment
type: feature
---

# Welfare Loans

Two products, both 1-month term, defined in `_shared/loanTerms.ts` + `src/utils/welfareLoanTerms.ts` (keep in sync).

## Multiplier Loan
- Max = 3× member shares.
- 10% service charge deducted upfront: 7% welfare income, 3% company revenue.
- Member receives principal − 10% (minus M-Pesa fee); repays full principal.
- Overdue: +5% of balance every month until fully repaid.

## Shares Loan
- Max = 75% of member shares.
- 5% charge upfront: 2.5% welfare, 2.5% company.
- Overdue: outstanding recovered from the member's shares; loan marked defaulted if a gap remains.

## Eligibility (per welfare, configurable on `welfares`)
- `loan_min_membership_months` (default 6), `loan_min_payment_rate` (default 0.95).
- Active member, registration fee cleared, no other open loan, shares > 0, `loans_enabled` true.
- Shares = completed welfare_contributions excluding `registration_fee`.

## Flow
- Requests need 2 executive approvals (chairman/secretary/treasurer); requester cannot approve own loan; admins can force.
- Disbursement: company share deducted from welfare balance immediately; cash goes out through a `withdrawals` row + `b2c-payout`, so the disbursed amount is deducted by `process_withdrawal_completion` (never deduct it twice).
- Repayment: in-app STK (pending row in `welfare_loan_repayments` matched by `checkout_request_id` in payment-stk-callback) or Paybill 4015351 with member ID — `c2b-confirm-payment` always settles an open loan before contributions.
- Accrual, overdue flagging, due reminders and shares recovery run inside `daily-reminder-cron`.
