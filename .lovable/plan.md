## Issue

`admin-sms-broadcast` uses the same fragile auth pattern that already broke `admin-send-user-sms`: it builds a per-request anon client from the incoming Authorization header and calls `userClient.auth.getUser()`. Under the new signing-keys system this returns 401 intermittently (especially on the native APK where the token isn't always in the in-memory cache).

Also: the function rejects with `"Message too short"` (status 400) when `preview` is true and the message is empty — but the frontend's "Preview recipients" button sends an empty message. That part already works because the check is `!preview && (!message...)`, so OK.

## Fix

Mirror the `admin-send-user-sms` fix in `admin-sms-broadcast/index.ts`:

1. Read `Authorization` case-insensitively, strip `Bearer ` from token.
2. Validate token directly with `admin.auth.getUser(token)` using the service-role client — no per-request anon client.
3. Return clearer 401 messages (`"Not signed in"` / `"Session expired"`).
4. Add `console.log` for `authHeader present`, `token length`, `getUser err`, `isAdmin`.

No frontend changes — `AdminSmsBroadcast.tsx` already calls via direct `fetch` with the bearer header.

## Verify

After deploy, call the function via `supabase--curl_edge_functions` with `{ segment:"all_users", preview:true }` as the logged-in admin and confirm 200 + `recipient_count`. Then trigger a small real broadcast with segment `top_trust` (smallest cohort) and check `admin_sms_broadcasts` table for a `completed` row.

## Files

- `supabase/functions/admin-sms-broadcast/index.ts` — auth block lines 262-294
