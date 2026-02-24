

## Diagnosis: M-Pesa STK Push Returns ResultCode 17

The STK push request is accepted by Safaricom (ResponseCode 0), but the actual payment fails with **ResultCode 17 ("System internal error")**. This means the credentials authenticate fine, but the transaction configuration is wrong.

### Root Cause

From the logs, your shortcode is `4015351` and the code uses `TransactionType: 'CustomerPayBillOnline'` with `PartyB: shortcode`. 

Based on a previous fix documented for this project: **if your M-Pesa number is a Till (Buy Goods) number rather than a Paybill number, the transaction type and party configuration are wrong.** This mismatch causes ResultCode 17.

### Key Question

Before implementing, I need to confirm: **Is 4015351 a Paybill number or a Till (Buy Goods) number?**

### Plan (assuming Till/Buy Goods)

Modify `supabase/functions/mpesa-stk-push/index.ts`:

1. Change `TransactionType` from `'CustomerPayBillOnline'` to `'CustomerBuyGoodsOnline'`
2. Change `PartyB` from `shortcode` to `tillNumber` (which is the actual Till number)
3. Use `tillNumber` as `BusinessShortCode` as well

These three changes align with the documented fix pattern for Till-based M-Pesa integrations.

### If it is a Paybill

If 4015351 is genuinely a Paybill, the issue is likely with the **Passkey** not matching the shortcode. The passkey must be the one specifically generated for Lipa Na M-Pesa Online for that exact Paybill number.

### Technical Detail

```text
Current (Paybill mode):
  BusinessShortCode = shortcode (4015351)
  PartyB            = shortcode (4015351)
  TransactionType   = CustomerPayBillOnline

Fix for Till mode:
  BusinessShortCode = tillNumber (4015351)
  PartyB            = tillNumber (4015351)
  TransactionType   = CustomerBuyGoodsOnline
```

