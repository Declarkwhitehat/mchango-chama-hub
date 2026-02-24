

## Plan: Fix C2B URL Registration

### Root Cause Identified

Your `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET` are **sandbox credentials** (the OAuth token they produce is only 28 characters — production tokens are 40+). These sandbox credentials work for getting an OAuth token from the production endpoint, but the token itself is invalid for making actual API calls like C2B URL registration.

This is also the same reason your **STK push returns ResultCode 17** — the credentials authenticate but the token cannot authorize any real operations.

### What Needs to Change

**You need to replace your M-Pesa credentials with production ones.** Here's how:

1. Go to https://developer.safaricom.co.ke/
2. Open your **production app** (not sandbox)
3. If you don't have a production app yet:
   - Create a new app
   - Select "Going Live" and follow the process to get production credentials for shortcode 4015351
   - Safaricom will issue production Consumer Key and Consumer Secret
4. Copy the **production Consumer Key** and **production Consumer Secret**

### Implementation Steps

1. **Update secrets** — I will prompt you to enter the new production `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET`
2. **Test the registration function** — Call `mpesa-register-c2b-urls` again to verify it works with production credentials
3. **No code changes needed** — The existing edge function is correctly implemented; only the credentials need updating

### Why This Fixes Everything

With production credentials:
- **C2B URL registration** will succeed (token will be valid)
- **STK push** will also start working (ResultCode 17 will be resolved)
- **Offline payments** will flow through once C2B URLs are registered

### Technical Details

- Current token length: 28 chars (sandbox) vs expected 40+ chars (production)
- The edge function `mpesa-register-c2b-urls` already exists and is correctly coded
- Both `mpesa-c2b-validation` and `mpesa-c2b-callback` are deployed with JWT verification disabled
- The `ShortCode`, `ConfirmationURL`, and `ValidationURL` in the registration payload are all correct

