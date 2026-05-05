---
name: PWA Native Distribution Strategy
description: Capacitor APK pointing to remote https://pamojanova.com, Play Store ready config
type: feature
---
Distribution: Capacitor-built Android APK (no PWA service worker). `capacitor.config.ts` `server.url = https://pamojanova.com` so any web deploy on Vercel is auto-picked up by installed APKs on next launch — users never need a new APK for content/feature changes.

Play Store hardening (v1.0.0):
- `cleartext: false` (removed) and `android.allowMixedContent: false`. App requires HTTPS.
- SDK matrix: `minSdkVersion=24`, `compileSdkVersion=34`, `targetSdkVersion=34` (set in CI via sed patch on `android/variables.gradle` after `npx cap add android`, since CI rebuilds the android folder fresh each run).
- `versionCode=1`, `versionName="1.0.0"` patched into `android/app/build.gradle` post-sync.
- `package.json` version mirrors APK version (`1.0.0`).

CI workflow `.github/workflows/build-apk.yml` does `rm -rf android && npx cap add android && npx cap sync` then runs the SDK/version sed patch step before `gradlew assembleDebug`. Direct edits to `android/app/build.gradle` do not survive CI.
