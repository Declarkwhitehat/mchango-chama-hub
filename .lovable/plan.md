# Welfare Loans

Replace the "coming soon" Loans tab with a working loan product with two loan types, eligibility checks, executive approval, automatic M-Pesa disbursement, and monthly interest accrual.

## Loan products

**A. Multiplier Loan (3x shares)**
- Maximum borrowable: 3 x member's shares (total confirmed contributions, excluding registration fee).
- Service charge: 10% of the loan, deducted upfront. Borrow KES 5,000 -> receive KES 4,500 minus the M-Pesa transaction fee, repay KES 5,000.
- Split of the 10%: 7% welfare income, 3% company revenue.
- Repayment due in 1 month. If unpaid, 5% of the outstanding balance is added each month until fully repaid.
- Member cannot take a new loan until the current one is fully cleared.

**B. Shares Loan (75% of shares)**
- Maximum borrowable: 75% of member's shares. KES 1,000 shares -> KES 750.
- Service charge: 5% upfront, split 2.5% welfare income / 2.5% company revenue.
- Repayment due in 1 month. On default, the outstanding amount is deducted from the member's shares and the loan is closed as "recovered from shares".

## Eligibility (checked automatically at request time)

- Active member with registration fee cleared.
- Member for at least 6 months.
- Has paid at least 95% of the required contributions to date (threshold configurable by executives per welfare).
- No open loan.
- Welfare has enough available balance to fund the loan.

## Approval and disbursement

- Member submits a request from the Loans tab; the app shows the amount receivable, charge, and repayment due date before confirming.
- Requires approval from at least 2 of the 3 executives (chairman, secretary, treasurer). The borrower cannot approve their own loan.
- Pending loan approvals appear in the existing welfare pending-actions banner.
- On the second approval: charge is split and booked, welfare available balance is reduced by the full loan amount, and a B2C payout is sent automatically to the member's registered M-Pesa number (Safaricom transaction fee borne by the member, as with withdrawals).
- Admin can force-approve or reject from the admin welfare view.

## Repayment

- Member repays via STK push from the Loans tab, or offline via Paybill 4015351 using their member ID (offline payments matched by the existing C2B handler and applied to the open loan before contributions).
- Partial repayments allowed; balance shown live with due date and any accrued monthly interest.
- Full repayment restores the welfare available balance and closes the loan.

## Notifications

Push and in-app notifications on: request submitted, each approval, disbursement, 3-day due reminder, overdue with new balance after monthly interest, repayment received, loan cleared, and shares recovery. No SMS reminders (per existing policy); transactional SMS on disbursement and clearance.

## Technical notes

- New tables: `welfare_loans` (member, welfare, type, principal, charge, welfare_share, company_share, amount_disbursed, balance, status, due_date, approvals count, disbursed/closed timestamps), `welfare_loan_approvals` (unique per approver per loan), `welfare_loan_repayments` (receipt, amount, source). All with GRANTs, RLS scoped to welfare members/executives/admins, and updated_at triggers.
- Settings on `welfares`: `loan_min_membership_months` (default 6), `loan_min_payment_rate` (default 0.95), `loans_enabled`.
- New edge function `welfare-loans` handling: eligibility quote, request, approve/reject, disburse (calls existing `b2c-payout`), repay (STK), and admin overrides. Follows the existing `verify_jwt = false` + service-role pattern.
- Interest accrual and default handling added to the existing daily cron rather than a new cron job: adds 5% monthly to overdue multiplier loans and triggers share recovery for overdue shares loans.
- Company cut recorded via `record_company_earning` (source `welfare_loan_commission`); welfare cut added to `welfare` profit totals and the financial ledger so admin reconciliation stays balanced.
- Idempotency: unique M-Pesa receipt registry reused for repayments and disbursements; disbursement guarded by a single-attempt lock so a loan can never be paid out twice.
- Frontend: `src/components/welfare/WelfareLoans.tsx` (eligibility card, product picker with live calculator, request form, active loan panel with countdown, history) rendered in the Loans tab of `src/pages/WelfareDetail.tsx`, plus approvals in `WelfarePendingActionsBanner.tsx`.
