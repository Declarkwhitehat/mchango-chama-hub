## Goal
Make signup phone entry flexible and the OTP step frictionless.

## 1. Accept multiple phone formats during account creation
Today signup forces strict `+2547XXXXXXXX`. Update the signup form (and any related validators) to also accept:
- `07XXXXXXXX` / `01XXXXXXXX` (Kenyan local)
- `7XXXXXXXX` / `1XXXXXXXX` (no leading zero)
- `2547…` / `2541…` (no plus)
- `+2547…` / `+2541…` (already supported)

Implementation:
- Reuse the existing `normalizePhone` helper in `src/utils/phoneUtils.ts` (already handles all these → `254XXXXXXXXX`).
- In the signup page (`src/pages/Auth*` / signup form), replace the strict regex with `isValidKenyanPhone()` for validation, and normalize to `+254…` before submitting to backend / `check_signup_uniqueness` / OTP send.
- Update the input placeholder + helper text to: "e.g. 0712345678, 0112345678, or +254712345678".
- Apply the same relaxed validation to `PhoneVerification.tsx` (currently hardcodes `+\d{10,15}` regex).

No backend / SMS / RLS changes — server already receives normalized `+254…`.

## 2. Auto-submit OTP when 6 digits entered
Wherever a 6-digit OTP is entered via `InputOTP`, trigger verification automatically once `value.length === 6` instead of requiring a "Verify" button click. Affected screens:
- `src/pages/ForgotPassword.tsx` (password reset OTP)
- `src/components/PhoneVerification.tsx` (phone verification)
- Signup OTP step (same pattern)
- `TwoFactorConfirmDialog` / `TwoFactorVerification` (only when in numeric 6-digit mode; backup-code mode stays manual)

Pattern: in the `onChange` handler, set the value and if `value.length === 6 && !loading`, call the existing verify function. Keep the Verify button visible as a fallback (disabled once auto-fire runs) so users on slow networks still have a recovery path.

## 3. Auto-fetch OTP from SMS
Two layers:

**a) Web (browser autofill)** — add `autoComplete="one-time-code"` and `inputMode="numeric"` to the OTP input slots. On iOS Safari and Chrome Android this surfaces the SMS code as a keyboard suggestion automatically (no code/permission needed). This is the only viable web path — the WebOTP API only works on https with a domain-bound SMS, which our Onfon templates don't include.

**b) Native Android (Capacitor)** — install and wire `@capacitor-community/sms-retriever` (or `capacitor-sms-retriever`) so the app listens for the OTP SMS in the background and fills it in. Requirements:
- Add an app hash to outgoing OTP SMS (11-char hash appended to message) — update the `send-otp` edge function to append the hash when the request comes from the native app (detected via a header like `X-Client-Platform: android`).
- On the OTP screen, if `Capacitor.isNativePlatform()`, start the retriever on mount, stop on unmount, and feed the parsed code into the same auto-submit flow from step 2.
- Graceful fallback: if the plugin isn't available or times out (5 min), user still types manually.

iOS does not need a plugin — the `one-time-code` autocomplete already covers it.

## Technical details
- Files to edit: `src/pages/Auth.tsx` (or whichever houses signup), `src/pages/ForgotPassword.tsx`, `src/components/PhoneVerification.tsx`, `src/components/TwoFactorConfirmDialog.tsx`, `src/components/TwoFactorVerification.tsx`, `src/components/ui/input-otp.tsx` (add `autoComplete`/`inputMode` props passthrough), `supabase/functions/send-otp/index.ts` (append app-hash for native).
- New dep (only if you approve native auto-read): `@capacitor-community/sms-retriever` + `npx cap sync` after build.
- Memory: add `mem/auth/otp-auto-submit.md` documenting the auto-submit + SMS-retriever rule.

## Open question
The native SMS-retriever path requires (a) a new Capacitor plugin and (b) an app-hash appended to every OTP SMS (consumes ~12 chars). Do you want me to include the native auto-read, or just do the web autofill + auto-submit (works on iOS + Android Chrome with no plugin, no SMS changes)?
