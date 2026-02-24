

## Analysis: STK Push Accepted but No Prompt (ResultCode 17)

The logs confirm that Safaricom **accepts** the STK push request (ResponseCode 0, "Success. Request accepted for processing"), but the callback returns **ResultCode 17 ("System internal error")**. This means no STK prompt is ever sent to your phone.

Since you just updated the passkey, these logs are from the **previous attempt** (before the passkey change). You should try again first to see if the new passkey resolves it.

However, if ResultCode 17 persists after retrying with the new passkey, the most likely causes are:

### Likely Root Causes

1. **Lipa Na M-Pesa Online (STK Push) is not activated for Paybill 4015351.** Having a Paybill number alone does not automatically enable STK Push. You must specifically request Safaricom to activate the "Lipa Na M-Pesa Online" API for your Paybill. This is the most common reason for ResultCode 17 on production Paybill numbers.

2. **Passkey mismatch.** The passkey must be the one Safaricom issued specifically for Lipa Na M-Pesa Online on Paybill 4015351. It is different from your consumer key/secret. You receive it from Safaricom after STK Push is activated.

### Recommended Steps (No Code Changes Needed)

1. **Retry the payment now** — the passkey was just updated, so test again to confirm whether the new passkey fixes it.

2. **If it still fails with ResultCode 17**, contact Safaricom Daraja support and confirm:
   - Is **Lipa Na M-Pesa Online (STK Push)** activated for Paybill **4015351**?
   - Is the passkey `187d51f...` the correct one issued for this Paybill's STK Push?

3. **No code changes are required.** The STK Push function is correctly configured for Paybill mode (`CustomerPayBillOnline`, `PartyB = shortcode`). The issue is on the Safaricom configuration side.

### Technical Detail

```text
Current configuration (correct for Paybill):
  BusinessShortCode = 4015351
  PartyB            = 4015351
  TransactionType   = CustomerPayBillOnline
  Password          = base64(shortcode + passkey + timestamp)

Safaricom response flow:
  1. API accepts request    → ResponseCode: 0 ✓
  2. Callback returns error → ResultCode: 17 ✗
  
This pattern (accept then fail) indicates the API credentials 
are valid but STK Push processing fails internally, typically 
because the Paybill is not enabled for Lipa Na M-Pesa Online.
```

