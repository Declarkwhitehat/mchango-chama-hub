

## Plan: Fix Mchango Commission Rate Bug and Correct Data

### Root Cause Found

The `c2b-confirm-payment` edge function **hardcodes a 15% commission rate for Mchango** (line 404), while the correct rate is **7%** (as defined in `supabase/functions/_shared/commissionRates.ts`). The `payment-stk-callback` function was already fixed to import from the shared config, but the C2B function was never updated.

This means every offline (PayBill) payment to a Mchango campaign has been overcharged on commission.

### Current DB State for "The BB ibechasers"

| Field | Current Value | Correct Value |
|-------|--------------|---------------|
| total_gross_collected | 110 | 110 (correct) |
| total_commission_paid | 16.5 | 7.70 |
| available_balance | 13.5 | 22.30 |
| current_amount | 15 | 22.30 |

The breakdown: KES 100 donation had commission 15 (should be 7), KES 10 donation had commission 1.5 (should be 0.7). After KES 80 in withdrawals, available should be: 110 - 7.7 - 80 = 22.30.

### Additional Bug: `current_amount` vs `available_balance` Mismatch

In `c2b-confirm-payment`, `current_amount` is incremented by the **gross** amount (line 443), but in `payment-stk-callback` it's incremented by the **net** amount (line 325). These two fields should track the same value. The C2B function is wrong.

---

### Changes

#### 1. Fix `c2b-confirm-payment` edge function

**File**: `supabase/functions/c2b-confirm-payment/index.ts`

- Import `COMMISSION_RATES` from shared config
- Replace hardcoded `0.15` with `COMMISSION_RATES.MCHANGO` (0.07)
- Fix line 443: change `current_amount` update from `+ grossAmount` to `+ netAmount` (matching what `payment-stk-callback` does)
- Update log messages from "15%" to use the actual rate

#### 2. Correct existing bad data via SQL migration

Run a data correction to recalculate the campaign's financial fields based on actual donations and withdrawals:

```sql
-- Fix the two donations that were charged 15% instead of 7%
UPDATE mchango_donations 
SET commission_amount = gross_amount * 0.07, 
    net_amount = gross_amount * 0.93
WHERE mchango_id = 'a8723f41-5a12-468b-a87f-53d46cc81f82'
  AND payment_status = 'completed';

-- Recalculate campaign totals
-- total_gross = 110, correct commission = 7.7, withdrawals = 80
-- available_balance = 110 - 7.7 - 80 = 22.3
UPDATE mchango 
SET total_commission_paid = 7.70,
    available_balance = 22.30,
    current_amount = 22.30
WHERE id = 'a8723f41-5a12-468b-a87f-53d46cc81f82';
```

#### 3. Fix company_earnings records

The company_earnings entries for these donations also reflect the wrong 15% amount. Update them to 7%.

---

### Summary

| File | Change |
|------|--------|
| `supabase/functions/c2b-confirm-payment/index.ts` | Import shared commission rates; fix Mchango rate from 15% to 7%; fix `current_amount` to use net not gross |
| Database migration | Correct donation commission amounts and campaign balance for "The BB ibechasers" |

