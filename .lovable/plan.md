## Goal
Block screenshots and screen recording on the native Android app for the Profile, Login, and Signup pages, and show a friendly toast when the user tries.

## Approach

**1. Install Capacitor Privacy Screen plugin**
Use `@capacitor-community/privacy-screen` (or `capacitor-plugin-screenshot` prevention) — sets Android's `FLAG_SECURE` on the window, which:
- Blacks out the screen in the app switcher
- Blocks screenshots (system shows "Can't take screenshot due to security policy")
- Blocks screen recording

**2. Create a `useScreenshotGuard` hook** (`src/hooks/useScreenshotGuard.ts`)
- On mount: call `PrivacyScreen.enable()` (native only, no-op on web)
- On unmount: call `PrivacyScreen.disable()`
- Listen to Android's screenshot-attempt broadcast (via `App` plugin's `pause`/media observer where available) → show a friendly toast:
  > "🔒 For your security, screenshots are disabled on this page."

**3. Wire the hook into 3 pages only**
- `src/pages/Auth.tsx` (login/signup)
- `src/pages/Profile.tsx`
- Any signup-specific page if separate

**4. Fallback toast trigger**
Android doesn't fire a reliable "screenshot taken" event when FLAG_SECURE is on (system blocks it silently). We'll:
- Rely on the OS's own "Can't take screenshot" system message (standard Android behavior)
- Additionally, on `visibilitychange` / app resume after a quick blur, show the friendly toast as a soft reminder that screenshots are disabled here

**5. Web / PWA behavior**
- Hook becomes a no-op on web (Capacitor platform check), so browser users are unaffected

## Files touched
- `package.json` — add plugin
- `src/hooks/useScreenshotGuard.ts` — new
- `src/pages/Auth.tsx` — add hook
- `src/pages/Profile.tsx` — add hook

## Post-implementation note to user
After merging, they'll need to `git pull` and run `npx cap sync android` to pick up the new native plugin before rebuilding the APK.
