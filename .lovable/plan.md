## M-PESA B2C Transaction Fee — Implementation Plan

Add tiered M-PESA B2C fee to all outgoing payouts. Fee is deducted from requested amount; recipient receives `amount - fee`. Stored on each `withdrawals` row and surfaced in admin views.

### Fee Tiers

```text
≤ 100      → 0 / 0 / 0
≤ 1,500    → 15 / 5 / 10
≤ 5,000    → 27 / 9 / 18
≤ 20,000   → 33 / 11 / 22
> 20,000   → 39 / 13 / 26
(transactionFee / safaricomCost / companyRevenue)
```

### 1. Shared Fee Utilities
- Create `supabase/functions/_shared/mpesaTransactionFee.ts` (Deno).
- Create `src/utils/mpesaTransactionFee.ts` (frontend mirror).

### 2. Database Migration
Add to `withdrawals` table (idempotent `ADD COLUMN IF NOT EXISTS`):
- `transaction_fee numeric default 0`
- `safaricom_cost numeric default 0`
- `company_revenue numeric default 0`

### 3. Edge Function: `withdrawals-crud`
On insert (Organization + Mchango withdrawals):
- Compute fee from requested `amount`
- `net_amount = amount - transactionFee`
- Persist `transaction_fee`, `safaricom_cost`, `company_revenue`
- `b2c-payout` continues to use `net_amount` unchanged

### 4. `WelfareWithdrawalRequest.tsx`
- Import frontend fee util; recompute as user types amount
- Show breakdown card: Transaction Fee + Recipient Receives
- On insert into `withdrawals`: store fee fields and `net_amount = numAmount - transactionFee`
- `welfare-cooling-off-payout` already forwards `net_amount` — no change

### 5. `WithdrawalButton.tsx`
- For `organizationId` / `mchangoId` flows only:
  - Compute fee live; replace "You'll Receive" card with Fee + Net display
  - Include `transaction_fee`, `safaricom_cost`, `company_revenue` in body to `withdrawals-crud`
- Chama withdrawals via this button: leave untouched (chama payouts go through cron).

### 6. Edge Function: `daily-payout-cron` (Chama auto payouts)
At payout time:
- Compute fee on `payoutAmount`
- Send `payoutAmount - transactionFee` to `b2c-payout`
- Update the corresponding `withdrawals` row with fee fields and corrected `net_amount`

### 7. Admin UI

Per-row columns in withdrawals tables of:
- `AdminOrganizationDetail.tsx`
- `AdminCampaignDetail.tsx`
- `AdminChamaDetail.tsx`
- `AdminWelfares.tsx` (welfare withdrawal listing)

Columns: Requested · Transaction Fee · Safaricom Cost · Company Revenue · Sent via M-PESA (`net_amount`).

Summary cards on revenue/analytics pages (`AdminRevenue` / `AdminCommissionAnalytics`):
- Total Transaction Fees Collected
- Total Safaricom Costs
- Total Company Revenue from Fees
- Filter by source: Chama Payout | Org Withdrawal | Campaign Withdrawal | Welfare Disbursement (derived from which FK is set on withdrawals row)

### Out of Scope
- No changes to `b2c-payout`, `welfare-cooling-off-payout`, `payout-approval`, `retry-failed-payouts`, `contributions-crud`, `c2b-confirm-payment` payout paths — they already consume `net_amount`.
- No changes to chama commission logic.

### Deploy
Redeploy: `withdrawals-crud`, `daily-payout-cron`.
