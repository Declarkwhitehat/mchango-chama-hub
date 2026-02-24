

## Analysis: STK Push Returning ResultCode 17

### What's Happening

Looking at your latest logs, the flow is:

1. **STK Push request** → Safaricom accepts it (ResponseCode "0", CheckoutRequestID assigned)
2. **Callback from Safaricom** → Returns **ResultCode 17** ("System internal error")
3. **Your callback function** correctly sets status to `'failed'` — but confusingly logs "Donation updated with breakdown" regardless

So the STK prompt may or may not appear on your phone, but Safaricom's backend cannot complete the transaction.

### Root Cause: Safaricom-Side Issue with Shortcode 4015351

ResultCode 17 after a successful ResponseCode 0 means Safaricom accepted the request but their internal processing failed. This is **not a code bug** — your edge functions are working correctly. Common causes:

- **Lipa Na M-Pesa Online not activated** for shortcode 4015351 on Safaricom's production backend (even if your Daraja app shows "Production")
- **Temporary Safaricom outage** for this shortcode
- **Shortcode configuration mismatch** — e.g., the shortcode is registered as a Paybill but the passkey doesn't match what Safaricom has on file

### What You Need to Do (Safaricom Side)

1. **Contact Safaricom M-Pesa support** (or your M-Pesa organization admin) and confirm:
   - Is "Lipa Na M-Pesa Online" (STK Push) activated for shortcode **4015351**?
   - Is the passkey you're using the correct one issued for this shortcode?
   - Has anything changed on the shortcode configuration recently?

2. If you previously had a **different shortcode** that was working, check whether the credentials/passkey match that shortcode instead.

### Code Fix: Bug in Callback Logging

There is one real bug worth fixing — your `mpesa-callback` function logs "Donation updated with breakdown" even when the payment **failed** (ResultCode 17). The donation gets status `'failed'` in the database correctly, but the log is misleading. I'll fix the log to only show the breakdown message on successful payments.

### Implementation Steps

1. Fix the misleading log in `mpesa-callback/index.ts` — move the breakdown log inside the `if (status === 'completed')` block
2. No other code changes needed — the issue is on Safaricom's end

### Technical Details

- `ResponseCode: "0"` = Safaricom queue accepted the request
- `ResultCode: 17` = Safaricom's internal processing failed (not your code)
- Your `AccountReference` (12 chars) and `TransactionDesc` (13 chars) are within Safaricom's limits
- The callback correctly writes `status: 'failed'` to the database

