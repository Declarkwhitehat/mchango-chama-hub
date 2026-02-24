

## Why Offline Payments Are Not Reflecting

### The Problem

Your **C2B callback URLs are not registered with Safaricom** for shortcode 4015351. This means when someone pays via Paybill with account number ORGN36K57, Safaricom processes the payment but has **nowhere to send the confirmation** — so your system never knows about it.

Evidence:
- Zero logs for `mpesa-c2b-callback` — Safaricom has never called this endpoint
- The automated URL registration via API keeps failing with "Invalid Access Token" error code `401.003.01`
- The OAuth token (28 chars) works for STK Push but is being rejected by the C2B Register URL API

### Why It Fails

Your Daraja app likely does not have the **C2B API product** enabled. The same credentials work for STK Push (confirmed working) but the C2B Register URL endpoint rejects the token. This is a Daraja portal configuration issue.

### What Needs To Be Done (Safaricom Daraja Portal)

You need to register the C2B URLs **manually through the Daraja portal**:

1. Go to https://developer.safaricom.co.ke/
2. Log in → **My Apps** → select your production app
3. Check that the **C2B** API product is subscribed/enabled (alongside Lipa Na M-Pesa Online)
4. Go to **APIs → C2B → Register URL** (or use the API test console)
5. Register these URLs for shortcode **4015351**:

   - **Validation URL**: `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-c2b-validation`
   - **Confirmation URL**: `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-c2b-callback`
   - **Response Type**: `Completed`

6. If the Daraja portal doesn't have a C2B test console, contact **Safaricom M-Pesa support** and ask them to register these C2B URLs for your shortcode

### How It Works Once Registered

```text
Customer pays via M-Pesa Paybill
         │
         ▼
Safaricom processes payment
         │
         ▼
Safaricom calls your Confirmation URL  ← THIS IS WHAT'S MISSING
(mpesa-c2b-callback)
         │
         ▼
Your system matches account "ORGN36K57"
to the organization, records donation,
updates balance, sends SMS confirmation
```

### Code Status

Your code is **fully ready** — no changes needed:
- `mpesa-c2b-callback` correctly handles organization lookups by `paybill_account_id` (e.g., ORGN36K57)
- `mpesa-c2b-validation` validates incoming payments
- Commission calculation, financial tracking, and SMS notifications are all implemented

The only missing piece is the Safaricom-side URL registration.

### After Registration — How to Verify

Once you register the URLs, make another test Paybill payment to 4015351 with account ORGN36K57. You should then see logs appear in the `mpesa-c2b-callback` function, and the payment will reflect on the organization's page.

