
# Plan: Fix native Android crashes, fingerprint setup, and shared-link routing

## Do I know what the issue is?
Yes.

## What I found
1. **Notification crash root cause**
   - The Android manifest is **missing key notification permissions** for modern Android (`POST_NOTIFICATIONS`, plus related notification permissions noted in the project guide).
   - Push init still mounts globally on app routes and can hit native APIs too early after session restore.
   - There is **no native deep app-state guard** (`App` plugin listeners) around push startup, so release builds can fail hard when permission/registration happens at the wrong time.

2. **Fingerprint problem**
   - The app currently mixes **device capability** with **app setup state**.
   - `biometricReady` only means “device/plugin available”, while actual login depends on prior local flags/session storage.
   - There is no professional “set up fingerprint” state flow for native users when the device supports biometrics but the app has not configured it yet.

3. **Shared links are broken in the native app**
   - There is **no Android deep-link intent filter** for campaign/organization/public links.
   - There is **no `App.addListener('appUrlOpen')` / `getLaunchUrl()` routing** in the app.
   - Some share URLs use `window.location.origin` or a hardcoded preview/published URL, so native shares can open the wrong destination or nowhere.

4. **Permissions are incomplete**
   - Camera/location/storage helpers exist and are lazy, which is good.
   - **Calendar permission is declared in AndroidManifest but there is no calendar permission helper / runtime flow.**
   - The manifest is also missing a few entries already documented in `ANDROID_PERMISSIONS_GUIDE.md`.

## Implementation plan

### 1. Harden Android native configuration
- Update `android/app/src/main/AndroidManifest.xml` to include the missing Android 13+ notification permission and the rest of the required native entries from the permissions guide.
- Add **deep-link intent filters** for:
  - `https://pamojanova.online/...`
  - `https://www.pamojanova.online/...`
  - optional custom app scheme fallback
- Add any missing notification metadata/channel defaults needed for stable release behavior.

### 2. Refactor push notifications professionally
- Rewrite `src/hooks/usePushNotifications.ts` so it:
  - never blocks rendering
  - initializes only after auth is stable and the app is active
  - separates **permission check**, **permission request**, and **token registration**
  - auto-registers silently only when permission is already granted
  - exposes an explicit `requestPermission()` flow for user-triggered enablement
  - attaches listeners once and cleans them up safely
  - logs failures without ever crashing the app
- Mount push init only where appropriate, not as an uncontrolled startup side effect.

### 3. Fix fingerprint properly
- Refactor `src/hooks/useNativeBiometrics.ts` and `src/pages/Auth.tsx` to separate:
  - **supported**
  - **enrolled on device**
  - **enabled for this app**
- Show:
  - **“Use Fingerprint/Face ID”** only when native login is already configured
  - **“Set up Fingerprint”** after password login when the device supports it but the app has not enabled it yet
- Keep all biometric checks non-blocking and use the already-resolved state instead of re-triggering async checks during login.
- Preserve password/PIN fallback at all times.

### 4. Finish native permission support
- Keep camera/location/storage permission requests lazy and action-based.
- Add a proper `ensureCalendarPermission()` helper in `src/lib/nativePermissions.ts`.
- Ensure every native permission request returns a safe result object and never throws into the UI.

### 5. Fix share links and landing behavior
- Create a centralized **public URL builder** so campaign/org/invite links always use the real production domain instead of preview/native origin.
- Update `ShareMenu` to use **Capacitor Share on native** and web fallback in browser.
- Add app-level deep-link handling so opening a shared campaign link routes correctly to:
  - `/mchango/:slug`
  - `/organizations/:slug`
  - `/chama/join/:slug?code=...`

### 6. Add focused regression tests
- Update/add tests for:
  - push init not blocking app startup
  - permission-granted push registration not crashing
  - biometric availability/setup/login states
  - native/public share URL generation
  - deep-link route parsing

## Files I expect to touch
- `android/app/src/main/AndroidManifest.xml`
- `src/App.tsx`
- `src/hooks/usePushNotifications.ts`
- `src/hooks/useNativeBiometrics.ts`
- `src/pages/Auth.tsx`
- `src/components/ShareMenu.tsx`
- `src/lib/nativePermissions.ts`
- likely a new small helper for canonical public URLs / deep-link routing

## How I will test it
1. **App startup**
   - Launch signed-in native app
   - Verify UI renders before push setup begins
   - Verify allowing notification permission does not freeze/crash

2. **Push notifications**
   - Test permission states: prompt, granted, denied
   - Verify registration errors fail softly
   - Verify app still works after allowing notifications

3. **Biometrics**
   - Device with fingerprint enrolled: verify setup prompt appears after login
   - Enable fingerprint in app, sign out, log back in with fingerprint
   - Device without biometric enrollment: verify graceful fallback to password/PIN

4. **Permissions**
   - Trigger camera, location, storage, and calendar flows one by one
   - Confirm no startup prompt spam and no crashes

5. **Shared links**
   - Share a campaign link from native app
   - Open link from WhatsApp/browser
   - Confirm it lands on the correct campaign inside the app or website

## What I may need you to do after implementation
Because these are **native Android changes**, after I make the fixes you will likely need to:
1. pull the latest code
2. run `npm install`
3. run `npx cap sync android`
4. rebuild and reinstall the Android app

For a true release verification, it is best to test on a **real Android device** with:
- notification permission prompt available
- fingerprint already enrolled in device settings

