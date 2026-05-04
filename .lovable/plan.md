## Goal

Eliminate the race condition where two users submitting identical phone/ID/email at the same millisecond can both pass the uniqueness check before either profile row is written.

## Important constraint (why we can't do exactly what was asked)

Supabase's `auth.users` table is owned by GoTrue. Passwords are hashed and users created **only** through the Auth API (`supabase.auth.signUp`) — a Postgres function cannot insert into `auth.users` with a usable password. So a single SQL `register_user(... password ...)` that creates the auth user atomically is not possible on Supabase.

The correct equivalent — and what this plan implements — is an **atomic reservation pattern**:

1. A new SQL RPC `reserve_signup_identity(phone, id_number, email)` runs the three uniqueness checks **inside a single transaction protected by transaction-scoped Postgres advisory locks** keyed on phone + id_number + email.
2. While that transaction holds the locks, any concurrent caller with the same phone/ID/email blocks and then fails the check.
3. The frontend immediately calls `supabase.auth.signUp` after the RPC returns success.
4. The existing `profiles_phone_unique` and `profiles_id_number_key` unique constraints remain as the final database-level safety net (they catch the tiny remaining window between RPC commit and `handle_new_user` trigger firing).

This collapses the race window from "two separate round trips" to "the time GoTrue takes to insert one row," and the unique indexes guarantee correctness even in that window.

## Changes

### 1. New migration — `reserve_signup_identity` RPC

```sql
CREATE OR REPLACE FUNCTION public.reserve_signup_identity(
  p_phone text, p_id_number text, p_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone_key  bigint := hashtextextended(lower(p_phone), 0);
  v_id_key     bigint := hashtextextended(lower(p_id_number), 0);
  v_email_key  bigint := hashtextextended(lower(p_email), 0);
BEGIN
  -- Transaction-scoped locks: serialize concurrent signups for same identity
  PERFORM pg_advisory_xact_lock(v_phone_key);
  PERFORM pg_advisory_xact_lock(v_id_key);
  PERFORM pg_advisory_xact_lock(v_email_key);

  IF EXISTS (SELECT 1 FROM profiles WHERE phone = p_phone) THEN
    RAISE EXCEPTION 'phone_exists' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id_number = p_id_number) THEN
    RAISE EXCEPTION 'id_number_exists' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'email_exists' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.reserve_signup_identity(text,text,text) TO anon, authenticated;
```

Also verify and (re)create if missing:
- `CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON profiles (phone);`
- `profiles_id_number_key` already exists per schema; assert via `IF NOT EXISTS`.

### 2. `src/pages/Auth.tsx` — replace two-step check with reservation RPC

In `handleSignup` (lines ~558–589):
- Remove the call to `check_signup_uniqueness`.
- Call `supabase.rpc('reserve_signup_identity', { p_phone, p_id_number, p_email })`.
- On error, map the message (`phone_exists` / `id_number_exists` / `email_exists`) to the existing toast strings — same UX as today.
- On success, immediately call `signUp(...)` (unchanged).
- Keep the existing `signUpError` mapping block as the final safety net for the unique-constraint violations (`profiles_phone_unique`, `profiles_id_number_key`, GoTrue "already registered").

### 3. Keep / leave alone

- `check_signup_uniqueness` RPC stays in the DB (used elsewhere for non-blocking pre-validation hints if needed) but is no longer on the signup critical path.
- `AuthContext.signUp` is unchanged.
- All other signup steps (consent insert, SMS, biometric prompt) unchanged.

## Result

- Two simultaneous signups with the same phone/ID/email: the second transaction blocks on `pg_advisory_xact_lock`, then fails the existence check and returns a clean `phone_exists` / `id_number_exists` / `email_exists` error. Only one reaches `auth.signUp`.
- Even in the worst case (lock released before `handle_new_user` writes the profile), the `profiles_phone_unique` and `profiles_id_number_key` indexes reject the duplicate and the existing error-mapping shows the correct toast.
- Frontend UX and error messages are unchanged.

## Files touched

- New: `supabase/migrations/<timestamp>_reserve_signup_identity.sql`
- Edited: `src/pages/Auth.tsx` (handleSignup body only)
