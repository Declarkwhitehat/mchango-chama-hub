## Overview

Six independent security hardening fixes. Each is scoped to avoid regressions: callbacks gain IP whitelisting, profile identity fields become immutable post-signup, OTP requests get strict rate-limiting, CORS becomes origin-restricted, B2C payouts gain admin + approval guards, and STK-push contributions get server-side amount validation.

## Important note on terminology

The user's spec mentions `is_admin` on the `profiles` table. This project does **not** store admin status there — it uses the standard `user_roles` table with `has_role(user_id, 'admin')`. All admin checks below use that established pattern (matches `admin_clear_payout_default` and the existing "Admins can update all profiles" RLS policy). UX is identical.

## Fix 1 — M-Pesa callback IP whitelisting

Create `supabase/functions/_shared/safaricomIp.ts` exporting:
- `getCallbackClientIP(req)` — reads `x-forwarded-for` (first hop), then `x-real-ip`, then `cf-connecting-ip`.
- `isSafaricomCallbackIP(ip)` — checks `196.201.214.0/24` and `196.201.216.0/24` via integer CIDR math, plus comma-separated `MPESA_CALLBACK_BYPASS_IPS` env var.

In `payment-stk-callback/index.ts` and `b2c-callback/index.ts`, immediately after the OPTIONS handler:
```ts
const clientIp = getCallbackClientIP(req);
if (!isSafaricomCallbackIP(clientIp)) {
  console.warn('[security] Rejected callback from non-Safaricom IP:', clientIp);
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

## Fix 2 — Phone & ID number immutable post-signup

**Migration**: add a BEFORE UPDATE trigger on `public.profiles` that blocks any change to `phone` or `id_number` once they are non-null, unless the caller is an admin (`has_role(auth.uid(),'admin')`) or the service role (`auth.uid() IS NULL`, i.e. backend functions). Initial INSERT is unaffected.

```sql
CREATE OR REPLACE FUNCTION public.prevent_identity_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role bypass
  v_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF v_admin THEN RETURN NEW; END IF;
  IF OLD.phone IS NOT NULL AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'Phone number cannot be changed. Contact support.' USING ERRCODE='P0001';
  END IF;
  IF OLD.id_number IS NOT NULL AND NEW.id_number IS DISTINCT FROM OLD.id_number THEN
    RAISE EXCEPTION 'ID number cannot be changed. Contact support.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_identity_changes ON public.profiles;
CREATE TRIGGER trg_prevent_identity_changes BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_identity_changes();
```

**Frontend** (`src/pages/Profile.tsx`): the phone and ID number sections are already display-only (no `<input>`). Add a small muted helper line under each: "Contact support to change this." Keep both fields visible.

## Fix 3 — OTP rate limit

In `send-otp/index.ts`, the existing `checkRateLimit(supabase, phone, 'phone', 'forgot_password')` defaults to 3 attempts per 4 hours. Change the action to a dedicated key and tighten the window to 10 minutes, keeping max 3:

```ts
const phoneRateLimit = await checkRateLimit(
  supabase, phone, 'phone', 'send_otp',
  10 * 60 * 1000,  // 10 minutes
  3,               // max 3 OTPs
);
```

Error response already includes `resetTime` and a "try again in N minutes" message — no other changes needed. Leave the IP rate limit and OTP generation logic untouched.

## Fix 4 — Restrict CORS

Replace `supabase/functions/_shared/cors.ts` with an origin-aware module:
- `buildCorsHeaders(req)` — returns headers with `Access-Control-Allow-Origin` set to the request `Origin` if it matches the allow-list, otherwise the production domain. Includes `Vary: Origin`.
- `resolveAllowedOrigin(origin)` — pure helper.
- Allow-list defaults: `pamojanova.com`, `www.pamojanova.com`, `pamojanova.online`, `www.pamojanova.online`, `mchango-chama-hub.lovable.app`, the Lovable preview URL, `localhost:3000/5173/8080`, `capacitor://localhost`. Override via `ALLOWED_ORIGINS` env var (comma-separated).
- **Backwards-compatible**: keep the existing `export const corsHeaders` so the ~50 functions that import it keep working. The static export uses the production origin as default; over time individual functions can switch to `buildCorsHeaders(req)`. Other CORS headers (Allow-Headers, Allow-Methods) are unchanged.

This does not touch any other function's logic; only the value of `Access-Control-Allow-Origin` changes.

## Fix 5 — B2C payout admin + approval guards

In `b2c-payout/index.ts`, immediately after parsing the request body and before the existing withdrawal lookup, add:

1. **Caller check** — accept either:
   - The Authorization bearer token equals `SUPABASE_SERVICE_ROLE_KEY` (internal callers like `retry-failed-payouts`), OR
   - `supabaseAdmin.auth.getUser(token)` returns a user AND `has_role(user.id, 'admin')` is true.

   On failure: log `{ caller_user_id, withdrawal_id, reason }`, return 403.

2. **Withdrawal approval check** — after the existing withdrawal fetch, additionally require:
   - `withdrawal.status === 'approved'` (the current code also accepts `pending_retry`/`processing` for legitimate retry flows — keep those as valid states but require that they have a non-null `approved_by`).
   - `withdrawal.approved_by !== null`.

   On failure: log `{ caller_user_id, withdrawal_id, status, approved_by }`, return 403.

The actual M-Pesa OAuth + B2C HTTP call is untouched.

## Fix 6 — Server-side chama contribution amount check

In `payment-stk-push/index.ts`, after the existing `validateAmount` block, when `body.callback_metadata?.type === 'chama_contribution'` (and `chama_id` + `member_id` are present):

1. Fetch chama: `select contribution_amount from chama where id = chama_id`.
2. Compute the member's outstanding due for the active cycle by calling the existing `check_member_schedule_eligibility(member_id, chama_id)` RPC, which returns `total_amount_owed` minus `carry_forward_credit`. The required minimum is `max(contribution_amount, total_amount_owed - carry_forward)`. If no active cycle / no debts, fall back to `contribution_amount`.
3. If `body.amount < required`, return 400 with `{ error: 'Amount below required contribution', required, submitted }`.
4. Overpayments are explicitly allowed (no upper cap added beyond the existing 1..1,000,000).

Mchango / organization donations and all other paths keep the existing `validateAmount` only.

## Files touched

**New**
- `supabase/functions/_shared/safaricomIp.ts`
- `supabase/migrations/<ts>_prevent_profile_identity_changes.sql`

**Edited**
- `supabase/functions/_shared/cors.ts` (origin allow-list, keep `corsHeaders` export)
- `supabase/functions/payment-stk-callback/index.ts` (IP guard at top)
- `supabase/functions/b2c-callback/index.ts` (IP guard at top)
- `supabase/functions/send-otp/index.ts` (rate-limit window tightened)
- `supabase/functions/b2c-payout/index.ts` (admin/service-role + approval guards)
- `supabase/functions/payment-stk-push/index.ts` (chama amount verification)
- `src/pages/Profile.tsx` (helper text under phone & ID)

## Optional follow-ups (not in this change set)

- New env vars to set in Cloud secrets when ready: `MPESA_CALLBACK_BYPASS_IPS` (optional), `ALLOWED_ORIGINS` (optional). Both have sensible defaults; not setting them keeps current behavior secure.
- Memory note: update `mem://auth/signup-uniqueness-validation` reference to also mention identity-immutability trigger.
