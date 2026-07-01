## Problem

When the user finishes entering the OTP, the client throws "Failed to send a request to the Edge Function". That specific error from `supabase.functions.invoke` means the request never reached a working function (CORS/preflight failure or the function is not currently deployed) — not a JSON error from our code.

The `request-daily-limit-increase` function was added recently and has never been re-deployed after the last edits, so the live version is either missing or stale. There are also two smaller correctness issues that will bite us right after we get the call through.

## Fix

1. **Force a fresh deploy** of `request-daily-limit-increase` so the current code is live.
2. **Tighten server validation** so it matches the UI:
   - Accept `requested_limit` in the inclusive range `150000 … 500000` (currently rejects exactly 150,000 with a confusing 400).
   - Simplify the OTP check to strictly 6 digits (`/^\d{6}$/`) — the current `\d{4}|\d{6}` regex is a leftover and misleading.
   - Return a clear 400 when `phone` is missing instead of the generic "Invalid OTP".
3. **Guarantee CORS on every path** (including thrown errors) so the browser never converts a real JSON error into the generic "Failed to send a request…" message. The handler already does this; I'll double-check the OPTIONS response uses `200` with the standard header set used across the project.
4. **Client-side safety net** in `DailyLimitIncreaseCard.tsx`:
   - Before invoking, `await supabase.auth.getSession()` and pass the access token explicitly in `headers` (same pattern we used for `admin-send-user-sms` to fix the native 401).
   - Surface the real server `error` string in the toast instead of the generic invoke message.

## Verification

- Re-deploy, then from the running preview submit a request with amount 300,000 and a valid OTP for `0707874790`.
- Confirm in edge-function logs that the function boots and returns 200, and that a row lands in `daily_limit_increase_requests` with `status = 'pending'`.
- Confirm the toast now shows the real reason (e.g. "Invalid or expired OTP") when a wrong code is entered, instead of the fetch-level error.

## Files touched

- `supabase/functions/request-daily-limit-increase/index.ts` — validation + CORS tidy-up, then deploy.
- `src/components/DailyLimitIncreaseCard.tsx` — attach session token to invoke, better error surfacing.
