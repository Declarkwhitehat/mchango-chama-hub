

## Problem: Commission Rate Mismatch — Backend Uses 15%, Frontend Shows 7%

You are absolutely right. If you donate KES 100 and the commission is 7%, the net should be **KES 93** (100 - 7 = 93), not KES 85.

### Root Cause

The backend M-Pesa callback (`mpesa-callback/index.ts` line 281) hardcodes the mchango commission rate at **15%**:
```
const commissionRate = 0.15;  // WRONG — should be 0.07
```

Meanwhile, the frontend (`commissionCalculator.ts`) correctly defines it as **7%**:
```
export const MCHANGO_COMMISSION_RATE = 0.07;
```

So the user sees "7% commission = KES 7" on the donation form, but the backend actually deducts 15% (KES 15), crediting only KES 85 instead of KES 93.

### Current Data Damage

All completed mchango donations have been processed at 15% instead of 7%:
- KES 100 donation → KES 15 commission (should be KES 7) → KES 85 net (should be KES 93)
- KES 50 donation → KES 7.50 commission (should be KES 3.50) → KES 42.50 net (should be KES 46.50)

---

## Fix Plan

### 1. Fix the backend commission rate
In `supabase/functions/mpesa-callback/index.ts`, change line 281 from `0.15` to `0.07` to match the defined mchango rate. Also import or reference the rate as a constant to prevent future mismatches.

Additionally fix the company_earnings description on line 341 which says "15% commission" — change to "7% commission".

### 2. Add a single source of truth
Create a shared commission rates constant file in `supabase/functions/_shared/commissionRates.ts` so the backend and frontend both reference the same rates. This prevents future mismatches.

### 3. Correct all historical donation data
Recalculate `commission_amount` and `net_amount` for all completed mchango donations using the correct 7% rate, and update the mchango campaign balances accordingly.

For each completed mchango donation:
- `commission_amount` = `gross_amount * 0.07` (was `* 0.15`)
- `net_amount` = `gross_amount * 0.93` (was `* 0.85`)

Then recalculate all mchango balances from the corrected donation records, and correct company_earnings entries.

### 4. Fix company_earnings records
Update all `mchango_donation` company_earnings entries to reflect the correct 7% commission amounts.

---

## Technical Details

| Step | File/Location | Change |
|------|--------------|--------|
| Fix rate | `supabase/functions/mpesa-callback/index.ts` line 281 | `0.15` → `0.07` |
| Fix description | `supabase/functions/mpesa-callback/index.ts` line 341 | `15%` → `7%` |
| Shared constants | `supabase/functions/_shared/commissionRates.ts` | New file with all commission rates |
| Data correction | Database migration | Recalculate all mchango donation amounts and campaign balances |
| Company earnings fix | Database migration | Correct overcharged commission entries |

### Files to modify
- `supabase/functions/mpesa-callback/index.ts` — fix hardcoded 0.15 to 0.07
- `supabase/functions/_shared/commissionRates.ts` — new shared constants file
- New database migration — correct all historical data

