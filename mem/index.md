# Project Memory

## Core
- Native Android APK (Capacitor) + Lovable Cloud Backend. PWA removed.
- Safaricom STK/C2B only. Deadlines strictly 22:00 EAT (UTC+3).
- Deductive commission: Net = Gross - Commission. Never modify gross payments.
- Auth: 5-digit PIN, SMS OTP for resets. `check_signup_uniqueness` for unauth.
- Financial Idempotency: Centralized settlement engine, strict FIFO, unique M-Pesa receipts.
- Deno Edge Functions: No catch type annotations. Never use 'mpesa' in payment function names.
- Sequential Member IDs (e.g., DOCTM0001) are immutable and auto-generated via DB.
- Scalability: UI capped at 50 records. `Promise.allSettled()` for parallel queries.
- Admin roles: only `super_admin` can create/revoke admins; all privilege-code-gated pages + edge functions are super_admin only.

## Memories
- [Twice-weekly first cycle anchor](mem://chama/twice-weekly-first-cycle-anchor) — Cycle 1 always closes on the first chosen weekday; manager start preview + confirm dialog
