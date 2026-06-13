---
name: OTP auto-submit & SMS autofill
description: 6-digit OTPs auto-verify on completion; web uses one-time-code autofill; phone signup accepts all Kenyan formats
type: preference
---

## Rules

- All 6-digit OTP entries (phone verify on signup, password reset, 2FA login & confirm dialog) MUST auto-trigger verification once `value.length === 6`. The "Verify" button remains as a fallback.
- Backup-code mode in 2FA stays manual (no auto-submit).
- OTP inputs MUST set `autoComplete="one-time-code"` and `inputMode="numeric"` so iOS Safari + Android Chrome surface the SMS code from the keyboard suggestion bar.
- Signup phone input accepts: `07XX…`, `01XX…`, `7XX…`, `1XX…`, `254…`, `+254…`. Normalized via `normalizePhone` / signup zod transform to `+254[17]XXXXXXXX`. Safaricom-only enforced.
- Native Android SMS Retriever plugin is NOT installed yet — only browser/IME autofill is supported. If added later, append the 11-char app hash to OTP SMS only for native clients.

## Files
- `src/pages/Auth.tsx` — signup zod schema phone transform
- `src/components/PhoneVerification.tsx` — signup OTP step
- `src/pages/ForgotPassword.tsx` — password reset OTP
- `src/components/TwoFactorVerification.tsx`, `TwoFactorConfirmDialog.tsx` — 2FA codes
