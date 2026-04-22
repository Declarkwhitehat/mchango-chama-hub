

# Fix Biometric Session Persistence and Auth Configuration

## Problem Summary
There are two overlapping biometric session systems (`secureStorage.ts` and `nativeBiometricSession.ts`), the Supabase client uses `localStorage` which gets wiped by Android OS under memory pressure, the app initializer runs outside the AuthContext lifecycle causing race conditions, and the JWT expiry is at the default 1 hour (too short for a mobile app with biometric unlock).

## Plan

### 1. Configure JWT expiry and refresh token reuse
- Use the `configure_auth` tool (or migration if needed) to set:
  - JWT expiry: **604800 seconds** (7 days)
  - Refresh token reuse interval: **10 seconds**
- This prevents stale tokens between app launches since a 7-day JWT means biometric unlock works even if the app was closed for days.

### 2. Create a custom Capacitor Preferences storage adapter for the Supabase client
- Create `src/lib/capacitorStorageAdapter.ts` — a class implementing the Supabase `SupportedStorage` interface (`getItem`, `setItem`, `removeItem`) that:
  - On native: delegates to `@capacitor/preferences` (async, but the Supabase client handles async storage)
  - On web: delegates to `localStorage`
- This ensures the Supabase SDK's own session persists in Capacitor Preferences, surviving Android WebView memory reclamation.

### 3. Update Supabase client to use the new storage adapter
- In `src/integrations/supabase/client.ts`, replace `storage: localStorage` with the new Capacitor storage adapter instance.
- Note: This file is auto-generated, but the `auth.storage` override is critical for native. We will create the adapter externally and only reference it in the client config.

### 4. Consolidate biometric session management — remove `nativeBiometricSession.ts`
- Delete `src/lib/nativeBiometricSession.ts` entirely.
- All biometric session storage now goes through `src/lib/secureStorage.ts` (which already uses `@capacitor/preferences`).
- Update any imports in `Auth.tsx`, `Profile.tsx`, or `AuthContext.tsx` that reference the old module.

### 5. Move app initializer logic inside AuthContext
- Remove standalone `initializeAppAuth()` calls from `Auth.tsx` or `main.tsx`.
- Inside `AuthContext.tsx`'s `initializeAuth` function:
  1. Check if native + biometric enabled + app locked.
  2. If so, attempt biometric authentication.
  3. On success, call `supabase.auth.setSession()` with stored tokens.
  4. On failure, stay in unauthenticated state (no redirect).
- This eliminates the race condition where `appInitializer.ts` runs before the AuthContext listener is mounted.

### 6. Make token sync atomic in AuthContext
- In the `onAuthStateChange` listener, when `SIGNED_IN` or `TOKEN_REFRESHED` fires with a valid session on native:
  - Atomically write both `access_token` and `refresh_token` to `secureStorage` in a single `setStoredSession()` call.
  - Only write if biometric is enabled (check via `isBiometricEnabledSync()`).
  - This is already partially implemented but will be tightened to use only `secureStorage.ts`.

### 7. Simplify Auth.tsx biometric restore
- Remove the three-strategy restore logic (SDK refresh, setSession, raw fetch) from `Auth.tsx`.
- Replace with a single call to the `restoreSession()` function from `appInitializer.ts` (or inline equivalent).
- The Supabase client itself now persists in Capacitor Preferences, so restoring is more reliable.

### 8. Clean up Auth.tsx fingerprint button visibility
- Keep the synchronous `isBiometricEnabledSync()` check for immediate button rendering.
- Ensure `isAppLockedSync()` is also checked so the button only shows when the app is in locked state (soft logout).

## Files to create
- `src/lib/capacitorStorageAdapter.ts` — Supabase-compatible async storage using Capacitor Preferences

## Files to edit
- `src/integrations/supabase/client.ts` — swap `localStorage` for Capacitor adapter
- `src/contexts/AuthContext.tsx` — integrate app init logic, atomic token sync
- `src/pages/Auth.tsx` — simplify biometric restore, remove old imports
- `src/pages/Profile.tsx` — remove duplicate session writes, use only `secureStorage.ts`
- `src/lib/appInitializer.ts` — retain as utility but no longer called standalone

## Files to delete
- `src/lib/nativeBiometricSession.ts` — consolidated into `secureStorage.ts`

## What you need to do after
1. Pull latest code
2. Run `npm install && npx cap sync android`
3. Rebuild the Android APK
4. Test: password login → enable fingerprint → lock app → fingerprint unlock

