

# Plan: Fix Push Notification Freezing & Harden Biometric Login

## Problem 1: Push Notifications Blocking App Startup
The `PushNotificationInit` component calls `initialize()` synchronously in a `useEffect`. On Android, `PushNotifications.requestPermissions()` and `PushNotifications.register()` can block the main thread or hang if Firebase isn't configured, freezing the entire app.

**Fix**: Defer push initialization with a 5-second `setTimeout` after mount, wrap the entire flow in a try/catch with a timeout guard (10s max), and ensure any failure is silently logged — never blocking rendering.

## Problem 2: Biometric Login Issues
The biometric hook and Auth page integration already exist and look correct. The likely cause of "fingerprint not working" is:
1. The auto-login `useEffect` in Auth.tsx runs before `isNativeBiometricAvailable` resolves, causing a race condition
2. The `isNativeApp()` regex `/; wv\)/` may not match all Android WebView user agents
3. The fingerprint button visibility depends on state that isn't set until after an async check completes

**Fix**: Fix the `isNativeApp()` detection, add a proper async state for biometric availability, and ensure the fingerprint button renders reliably.

## Changes

### 1. Fix `isNativeApp()` detection (both hooks)
Replace fragile regex with `!!(window as any).Capacitor?.isNativePlatform?.()` which is the official Capacitor check.

**Files**: `src/hooks/usePushNotifications.ts`, `src/hooks/useNativeBiometrics.ts`

### 2. Make push notifications fully non-blocking
- Add 5-second delay before initialization starts
- Add 10-second timeout on the entire init flow
- Wrap in try/catch that never throws
- Remove the `useEffect` dependency on `initialize` (use ref-based guard only)

**File**: `src/hooks/usePushNotifications.ts`, `src/App.tsx`

### 3. Fix biometric availability check in Auth.tsx
- Add `biometricAvailable` state initialized via `useEffect` with proper async resolution
- Show fingerprint button based on resolved state, not inline async calls
- Fix the auto-login effect to not race with availability check

**File**: `src/pages/Auth.tsx`

### 4. Fix duplicate `checkBiometry` call
The `isAvailable` function calls `BiometricAuth.checkBiometry()` twice. Remove the duplicate.

**File**: `src/hooks/useNativeBiometrics.ts`

## Files Summary

| Action | File |
|--------|------|
| Edit | `src/hooks/usePushNotifications.ts` — deferred non-blocking init |
| Edit | `src/hooks/useNativeBiometrics.ts` — fix detection + duplicate call |
| Edit | `src/App.tsx` — remove initialize dependency |
| Edit | `src/pages/Auth.tsx` — reliable biometric state + button visibility |

## Technical Notes
- Dependencies are already at latest stable versions (Capacitor 8.x, biometric-auth 10.x) — no upgrades needed
- `@aparajita/capacitor-biometric-auth` is the correct plugin for Capacitor 8
- No database or migration changes required

