# Play Store Hardening Plan

## 1. Capacitor config (`capacitor.config.ts`)
- Remove `cleartext: true` from `server`. Keep `server.url = 'https://pamojanova.com'`.
- Remove `android.allowMixedContent: true` (default = false). Cleartext HTTP will now be blocked, which is what Play Store expects since the server is HTTPS.

## 2. Android Gradle / SDK versions
The committed `android/` folder is regenerated every CI run (`rm -rf android && npx cap add android`), so editing `android/app/build.gradle` directly will not survive a build. We will:
- Add a **patch step** in `.github/workflows/build-apk.yml` (after `npx cap sync android`, before `gradlew assembleDebug`) that uses `sed` to set in `android/app/build.gradle`:
  - `minSdkVersion 24`
  - `targetSdkVersion 34`
  - `compileSdkVersion 34`
  - `versionCode 1`
  - `versionName "1.0.0"`
- Same patch step writes `android/variables.gradle` overrides for `minSdkVersion`, `compileSdkVersion`, `targetSdkVersion` (Capacitor reads these).
- For local/native devs, also update the committed `android/app/build.gradle` stub and `android/app/src/main/AndroidManifest.xml` is left untouched (no cleartext flag there).

## 3. `package.json`
- Bump `"version"` from `0.0.0` → `"1.0.0"`.

## 4. Delete My Account (user-initiated)
Adds a self-service deletion flow distinct from the existing admin-only `admin-delete-user` function.

**New edge function `delete-my-account`** (`verify_jwt = false`, validated via Bearer token like other functions):
- Requires the authenticated user.
- Requires body `{ confirm_phrase: "DELETE MY ACCOUNT", password }`.
- Re-verifies the user's password via `signInWithPassword` against their email.
- Blocks deletion if user has:
  - any active chama membership with unpaid current cycle,
  - any pending withdrawal,
  - any unsettled welfare obligations,
  - admin/super_admin role.
- On success: soft-deletes profile (`deleted_at`, `deletion_reason = 'user_self_deletion'`), bans auth user (`ban_duration: '876000h'`), writes audit log row, returns success.

**UI** — new section at the bottom of `src/pages/Security.tsx` (preferred) inside a destructive-styled card:
- Button "Delete My Account" → opens `AlertDialog`.
- Dialog shows warning about irreversibility, 45-day grace, what gets removed.
- Inputs: password + type-to-confirm phrase `DELETE MY ACCOUNT`.
- "Delete Permanently" button disabled until both filled and phrase matches.
- On confirmation: invokes the edge function; on success calls `signOut()` and navigates to `/`.

## 5. Privacy Policy publicly accessible + linked
- `/privacy` is **already** an unauthenticated route in `src/App.tsx` — verified, no change needed there.
- `src/pages/Auth.tsx`: add a small footer link under both the **Login** and **Sign up** tabs (and beside the existing Terms checkbox in signup): "By continuing you agree to our [Terms](/terms) and [Privacy Policy](/privacy)." Use `<Link>` from `react-router-dom`.
- `src/pages/ForgotPassword.tsx` + `src/pages/ResetPassword.tsx`: add the same single-line link in the footer for consistency.

## 6. Native auto-update assurance
Server URL stays `https://pamojanova.com`, so any web deploy is instantly picked up by the installed APK on next launch — confirmed by current Capacitor config strategy. No code change needed; documented for the user.

## Files touched
```
capacitor.config.ts                          (cleartext + allowMixedContent)
android/app/build.gradle                     (stub for local dev)
package.json                                 (version 1.0.0)
.github/workflows/build-apk.yml              (sed patches for SDK + version*)
src/pages/Security.tsx                       (Delete My Account section)
src/pages/Auth.tsx                           (Privacy/Terms links)
src/pages/ForgotPassword.tsx                 (Privacy link)
src/pages/ResetPassword.tsx                  (Privacy link)
supabase/functions/delete-my-account/index.ts  (NEW)
supabase/config.toml                         (register new function, verify_jwt=false)
```

## Memory updates
- New memory `mem://security/self-account-deletion-flow` describing password+phrase confirmation, soft-delete + auth ban, blocking conditions.
- Update `mem://architecture/pwa-native-distribution-strategy`: cleartext + mixed content disabled for Play Store readiness; SDK matrix min24/target34/compile34; v1.0.0 (versionCode 1).
