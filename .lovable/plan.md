

# Plan: Fix Push Init Delay + Biometric Race Condition + Fingerprint Button Visibility

## What I Found (correcting the bug report)

**Bug 1 claim is outdated.** `src/hooks/usePushNotifications.ts` does NOT have duplicate `useEffect` or duplicate `return` statements anymore — the previous fix already cleaned it up. It currently has exactly ONE `useEffect` (line 110) and ONE `return { initialize }` (line 127). The only adjustment needed is changing the delay from **5 seconds → 8 seconds** as you requested.

**Bug 2 is real and confirmed.** `src/pages/Auth.tsx` line 390 inside `handleLogin`:
```ts
const nativeBioAvailable = isNative && await isNativeBiometricAvailable();
```
This async call fires immediately after a successful login, at the same moment push notification init is being triggered by the new session. That's the crash. The resolved `biometricReady` state (line 95) already holds this value and must be used instead.

**Bonus bug found.** The fingerprint button (line 829) is gated by `isWebAuthnSupported()` only:
```tsx
{isWebAuthnSupported() && !biometricCancelled && ( ... Fingerprint button ... )}
```
On the native Android APK, `isWebAuthnSupported()` returns false, so the button **never appears** even when native biometrics are available and `biometricReady` is true. Must include `biometricReady` in the condition.

## Changes

### 1. `src/hooks/usePushNotifications.ts` — bump delay 5s → 8s
One-line change inside the existing `useEffect` (line 116): change `5000` to `8000`. Update the comment on line 109 to say "8-second delay". No structural changes — file is already clean.

### 2. `src/pages/Auth.tsx` — use resolved `biometricReady` state in `handleLogin`
Replace line 390:
```ts
const nativeBioAvailable = isNative && await isNativeBiometricAvailable();
```
with:
```ts
const nativeBioAvailable = isNative && biometricReady;
```
This eliminates the race with notification init. `biometricReady` is already resolved on mount via the existing `useEffect` (lines 98–112).

### 3. `src/pages/Auth.tsx` — fix fingerprint button visibility on native APK
Change line 829 from:
```tsx
{isWebAuthnSupported() && !biometricCancelled && (
```
to:
```tsx
{(isWebAuthnSupported() || biometricReady) && !biometricCancelled && (
```
Now the button renders on native Android when biometrics are available, AND in browsers where WebAuthn is supported. Existing `handleBiometricLogin` already branches on `isNative` so it handles both paths correctly.

## Files Summary

| Action | File | Change |
|--------|------|--------|
| Edit | `src/hooks/usePushNotifications.ts` | 5000 → 8000 ms delay |
| Edit | `src/pages/Auth.tsx` line 390 | drop `await isNativeBiometricAvailable()`, use `biometricReady` |
| Edit | `src/pages/Auth.tsx` line 829 | add `\|\| biometricReady` to button visibility condition |

## Result After Fix
- App never crashes after login when notification permission is granted (no async biometric call competing with push init)
- Fingerprint button appears reliably on native Android when `biometricReady === true`
- Push init waits a full 8 seconds after login before touching native APIs
- Zero duplicate code in `usePushNotifications.ts` (already true, preserved)

