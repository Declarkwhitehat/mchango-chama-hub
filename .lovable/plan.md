

## Diagnosis: Why Your Offline Payment Didn't Update

### Root Cause

**The C2B callback URLs have not been registered with Safaricom for your Paybill number (4015351).**

Both the `mpesa-c2b-validation` and `mpesa-c2b-callback` backend functions show **zero logs** — meaning Safaricom never sent a payment notification to your system after you paid. The campaign `The BB ibechasers` exists correctly with `paybill_account_id = MCFFFKEB`, and the code to match and record the donation is working. The problem is purely that Safaricom doesn't know where to send the C2B confirmation.

### What Needs to Happen

**You must register C2B URLs with Safaricom.** This is a one-time setup on the Safaricom Daraja portal (not a code fix). Here's what to register:

- **Validation URL:** `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-c2b-validation`
- **Confirmation URL:** `https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-c2b-callback`
- **ShortCode:** `4015351`
- **ResponseType:** `Completed`

You can register via:
1. **Daraja Portal:** Go to your app → APIs → C2B → Register URLs
2. **API call:**
```text
POST https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl
{
  "ShortCode": "4015351",
  "ResponseType": "Completed",
  "ConfirmationURL": "https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-c2b-callback",
  "ValidationURL": "https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mpesa-c2b-validation"
}
```

### Optional Code Enhancement

Once C2B URLs are registered, I can also build an **edge function to automate C2B URL registration** so you don't need to do it manually via the Daraja portal. This function would use your existing M-Pesa credentials to call the registration API.

### About the KSh 10 Payment

Since Safaricom processed the payment but never notified your system, the money is in your Paybill account but not reflected in the campaign. After registering the C2B URLs, **future payments will be automatically recorded**. For this specific KSh 10 payment, I can create a manual reconciliation option or you can re-test with a new payment once URLs are registered.

### Technical Details

- The `mpesa-c2b-callback` function correctly looks up `paybill_account_id` matching `MCFFFKEB` and would record the donation with 15% commission.
- JWT verification is already disabled for both C2B endpoints (required since Safaricom sends unauthenticated callbacks).
- The campaign record exists: `paybill_account_id = 'MCFFFKEB'`, `slug = 'the-bb-ibechasers'`.

