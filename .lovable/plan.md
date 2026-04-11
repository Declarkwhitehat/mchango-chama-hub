

# Plan: Native Push Notifications + Biometric Authentication for Pamoja APK

## Important Architecture Note

Your APK loads the web app from a remote URL (`pamojanova.online`). This means:
- **Capacitor native plugins CAN work** — the bridge is injected into the WebView regardless
- **Biometric auth**: We'll use `@capawesome/capacitor-biometrics` which provides native fingerprint/Face ID
- **Push notifications**: Requires Firebase setup first — I'll guide you through that, then implement the code

---

## Step 1: Firebase Setup (You need to do this)

Before I can implement push notifications, you need to create a Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use an existing one)
3. Add an Android app with package name: `online.pamojanova.pamoja`
4. Download the `google-services.json` file
5. Upload it to this project (I'll place it correctly)

Once you have the file, share it with me and I'll proceed with the push notification implementation.

---

## Step 2: Install Native Plugins (npm packages)

- `@capacitor/push-notifications` — for Firebase Cloud Messaging
- `@capawesome/capacitor-biometrics` — for fingerprint/Face ID authentication

---

## Step 3: Biometric Authentication (can do immediately)

### New file: `src/hooks/useNativeBiometrics.ts`
- Check if running in native app context (Capacitor bridge available)
- Use `@capawesome/capacitor-biometrics` to check availability, authenticate
- Enable `fallbackEnabled: true` for PIN/pattern/password fallback
- Handle success, failure, and cancellation with proper error messages
- Fallback to existing WebAuthn flow when not in native context

### Update: `src/hooks/useWebAuthn.ts`
- Integrate native biometric check — prefer native biometrics when available in APK
- Fall back to WebAuthn for PWA users

### Update: Auth-related components
- Wire native biometric authentication into login and sensitive action flows

---

## Step 4: Push Notifications Implementation

### New file: `src/hooks/usePushNotifications.ts`
- Request notification permission (handles Android 13+ `POST_NOTIFICATIONS`)
- Register device with FCM
- Listen for all events: `registration`, `registrationError`, `pushNotificationReceived`, `pushNotificationActionPerformed`
- Store device token in database for server-side sending

### New migration: `device_tokens` table
- `id`, `user_id`, `token`, `platform`, `created_at`, `updated_at`
- RLS policies so users can only manage their own tokens

### Update: `src/App.tsx` or auth flow
- Initialize push notification registration after user logs in

---

## Step 5: Update GitHub Actions Workflow

### Update: `.github/workflows/build-apk.yml`
- Add step to copy `google-services.json` from a GitHub secret (Base64-encoded) into `android/app/` after `cap add android`
- Ensure `npx cap sync android` runs after plugin installation
- All existing steps preserved — no breakage

```text
Workflow order:
  checkout → node setup → java setup → npm install → build
  → rm -rf android → cap add android
  → decode google-services.json secret → copy to android/app/
  → cap sync android → chmod gradlew → assembleDebug
  → upload artifact → create release
```

---

## Step 6: AndroidManifest.xml Permissions

Since the workflow rebuilds `android/` from scratch, permissions are added via a post-sync script or a Capacitor plugin config that auto-injects them. The plugins handle this automatically during `cap sync`:
- `android.permission.POST_NOTIFICATIONS` — added by `@capacitor/push-notifications`
- `android.permission.USE_BIOMETRIC` + `USE_FINGERPRINT` — added by `@capawesome/capacitor-biometrics`

---

## Execution Order

1. **Immediately**: Install plugins, implement biometric auth, update workflow
2. **After you provide google-services.json**: Complete push notification integration and device token storage

---

## Summary of Files Changed/Created

| Action | File |
|--------|------|
| Create | `src/hooks/useNativeBiometrics.ts` |
| Create | `src/hooks/usePushNotifications.ts` |
| Update | `src/hooks/useWebAuthn.ts` |
| Update | `src/App.tsx` |
| Update | `.github/workflows/build-apk.yml` |
| Update | `package.json` (new deps) |
| Migration | `device_tokens` table |

