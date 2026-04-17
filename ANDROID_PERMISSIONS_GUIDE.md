# Android Permissions — Required Manifest Entries

The Capacitor plugins below have been added to the project and configured to
request permissions **on first use only** (no startup blocking, no freezes).

| Plugin | Used for |
|---|---|
| `@capacitor/camera` | Profile photos, KYC uploads, document capture |
| `@capacitor/geolocation` | Optional location for groups, fraud signals |
| `@capacitor/filesystem` | PDF receipts, downloaded reports |
| `@capacitor/network` | Offline detection, retry queues |
| `@capacitor/device` | Device fingerprinting for fraud monitoring |
| `@capacitor/share` | Sharing payment/receipt links |
| `@capacitor/push-notifications` | Transactional + chama alerts |
| `@capacitor/app` / `@capacitor/status-bar` | App lifecycle + theming |
| `@aparajita/capacitor-biometric-auth` | Fingerprint / Face login |

## After pulling these changes

Run the standard Capacitor sync so the native Android project picks up the new
plugins:

```bash
npm install
npx cap sync android
```

## Verify `android/app/src/main/AndroidManifest.xml`

Open the file and ensure the following permissions exist **inside the
`<manifest>` tag, above `<application>`**. Capacitor adds most of these
automatically when you run `npx cap sync`, but it is safe (and recommended) to
confirm:

```xml
<!-- Network / push notifications -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />

<!-- Camera + media -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-feature android:name="android.hardware.camera" android:required="false" />

<!-- Storage (legacy + scoped) -->
<uses-permission
    android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
<uses-permission
    android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="29" />

<!-- Location (foreground only) -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Biometrics -->
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

## How the app requests permissions

All permission prompts are **deferred** and triggered only when the user takes
an action that needs them. They are routed through helpers in
`src/lib/nativePermissions.ts`:

```ts
import { ensureCameraPermission } from '@/lib/nativePermissions';

const result = await ensureCameraPermission();
if (!result.granted) {
  toast.error('Camera access is required to upload your photo.');
  return;
}
// ... proceed with Camera.getPhoto(...)
```

The same pattern is exposed for location (`ensureLocationPermission`) and
storage (`ensureStorageAvailable`). On the web build these helpers return
`{ granted: false, reason: 'unsupported' }` so the calling code can fall back
to a standard `<input type="file">` or browser geolocation API.

Push notifications and biometrics keep their existing dedicated hooks
(`usePushNotifications`, `useNativeBiometrics`).