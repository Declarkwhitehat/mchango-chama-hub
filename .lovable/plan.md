
Goal: make native fingerprint login work reliably, prompt setup immediately after first successful password login, and allow later sign-in with fingerprint only on the auth screen.

What I found
1. The main bug is stale session storage for native biometric login.
   - In `src/pages/Auth.tsx`, `storeNativeBiometricSession()` saves the current `access_token` and `refresh_token` into `localStorage`.
   - Later, auth token rotation keeps happening in the background, but the saved `biometricSession` is not kept in sync.
   - Supabase refresh tokens are one-time use and rotate. The auth logs confirm this exact failure:
     - `Invalid Refresh Token: Refresh Token Not Found`
     - `session_not_found`
   - So after logout / later login, fingerprint succeeds locally, but restoring the old saved session fails, which triggers the “Your session has expired…” message.

2. There is duplicated native biometric session logic.
   - `src/pages/Auth.tsx` stores biometric session one way.
   - `src/pages/Profile.tsx` separately writes `biometricSession` directly.
   - This makes it easy for the app to save outdated tokens again.

3. The “ask me to enable fingerprint right after first login” flow is present but fragile.
   - It is triggered in `Auth.tsx` after password login and after 2FA login.
   - But if storing the session fails, or auth state / redirect timing wins first, the setup flow can be skipped or become unreliable.

4. Fingerprint-only login is partially implemented already.
   - The native auth screen can show a fingerprint button without email input.
   - The missing piece is restoring a fresh valid session every time, not a stale one.

Implementation plan
1. Centralize native biometric credential/session management
   - Move native biometric storage/restore logic into a shared helper or hook used by both `Auth.tsx` and `Profile.tsx`.
   - Remove duplicated direct writes to `localStorage` from `Profile.tsx`.
   - Keep one source of truth for:
     - `nativeBiometricEnabled`
     - stored session payload
     - clearing invalid biometric state

2. Keep stored biometric session fresh automatically
   - Update the saved native biometric session whenever auth state changes to a valid session, especially on:
     - successful sign-in
     - `TOKEN_REFRESHED`
     - successful 2FA completion
   - This prevents the stored refresh token from becoming stale.
   - Also avoid saving only once during setup and then never updating it again.

3. Harden biometric restore flow
   - In `Auth.tsx`, make native fingerprint login restore use the latest stored refresh token first.
   - If restore fails, clear invalid biometric storage cleanly and show a precise recovery message.
   - Keep fingerprint login independent from manual email entry.

4. Make first-login fingerprint enrollment consistent
   - After successful password login or 2FA login on native:
     - wait until session is confirmed
     - save a fresh biometric session snapshot
     - then open the fingerprint setup dialog before redirecting away
   - This ensures the user is actually prompted the first time instead of needing to visit Profile manually.

5. Prevent redirect timing from interfering
   - Refactor the redirect logic in `Auth.tsx` so the “already logged in” redirect does not race against:
     - `showBiometricSetup`
     - 2FA completion
     - native biometric enrollment flow
   - The current render-time `setTimeout(...)` redirect is fragile and should be moved to a safer effect-based flow.

6. Align logout behavior with biometric quick re-entry
   - Keep local-only sign-out behavior in `AuthContext.tsx`.
   - Verify no other logout paths revoke the session globally or wipe biometric storage unexpectedly.
   - Keep fingerprint login available on the auth page after logout.

Files to update
- `src/pages/Auth.tsx`
  - fix native biometric restore
  - trigger setup reliably after first password/2FA login
  - refactor redirect race conditions
- `src/pages/Profile.tsx`
  - replace duplicate session-saving logic with shared native biometric helper
- `src/hooks/useNativeBiometrics.ts` or a new shared hook/helper
  - add unified native biometric session persistence/restore helpers
- `src/contexts/AuthContext.tsx`
  - sync stored biometric session on valid auth changes
  - keep logout compatible with native biometric relogin

Expected result after fix
1. User logs in with password the first time in the native app.
2. App immediately asks whether to enable fingerprint login.
3. If enabled, a fresh biometric-backed session is stored and kept updated.
4. User logs out.
5. On the auth screen, user taps fingerprint and signs in successfully without entering email first.
6. No more “session expired” loop unless the session is truly invalid, in which case biometric is reset cleanly.

What I’ll verify after implementation
- First password login on native shows fingerprint setup prompt
- Enabling fingerprint from the prompt works
- Enabling fingerprint later from Profile also works
- Logout keeps fingerprint login available
- Fingerprint-only login works from `/auth` without email input
- 2FA + fingerprint flow still works
- Invalid biometric state clears gracefully instead of looping

What you may need to do after I implement it
- Pull the latest changes
- Run `npx cap sync android`
- Rebuild/reinstall the Android app
- Test one clean cycle:
  1. password login
  2. enable fingerprint
  3. logout
  4. fingerprint-only login

