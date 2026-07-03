# Fix: Creator Delete Campaign — 500 Error on Sweep

## Root cause
Edge function `mchango-creator-delete` sweeps remaining campaign balance into `company_earnings` with `source='abandoned_funds'`. The DB check constraint `company_earnings_source_check` does not allow that value, so the insert fails:

```
new row for relation "company_earnings" violates check constraint "company_earnings_source_check"
```

The sweep aborts → function returns 500 → UI shows "edge function returned a non-2xx".

Allowed values today: `commission`, `verification_fee`, `account_verification_fee`, `mpesa_b2c_revenue`, `loan_fees`, `withdrawal_fees`, `chama_withdrawal`, `mchango_withdrawal`, `organization_withdrawal`, `welfare_withdrawal`, `other` (plus camelCase duplicates).

## Fix (single migration)
Extend the check constraint to include `abandoned_funds`:

```sql
ALTER TABLE public.company_earnings
  DROP CONSTRAINT company_earnings_source_check;

ALTER TABLE public.company_earnings
  ADD CONSTRAINT company_earnings_source_check
  CHECK (source = ANY (ARRAY[
    'COMMISSION','commission',
    'verificationFee','verification_fee',
    'accountVerificationFee','account_verification_fee',
    'mpesa_b2c_revenue','loan_fees','withdrawal_fees',
    'chama_withdrawal','mchango_withdrawal',
    'organization_withdrawal','welfare_withdrawal',
    'abandoned_funds',
    'other'
  ]));
```

No code change to the edge function needed — it already writes `abandoned_funds` (matching the ledger/policy memory).

## Verify
- Retry deleting the expired campaign that failed (Hezron Mwita se...). Expect success toast with swept KES amount.
- Confirm a row appears in `/admin/abandoned-funds` and in `company_earnings` with `source='abandoned_funds'`.
