

# Plan: Fix Fingerprint Authentication in Native App

## Problem

The Auth page only uses **WebAuthn** (a browser API) for biometric login. Android WebView inside the Capacitor app doesn't support WebAuthn, so fingerprint never works. The proper native biometric hook (`useNativeBiometrics`) exists but is never used on the Auth page.

## Auto-Update

The app already auto-updates — `capacitor.config.ts` loads content from `https://pamojanova.online`, so every website deploy automatically updates the app. No changes needed here, but I'll add a visible version indicator so users can confirm they're on the latest version.

## Changes

### 1. Update Auth.tsx — Use native biometrics in the app

- Import `useNativeBiometrics` alongside `useWebAuthn`
- On the Auth page, detect if running in native app:
  - **Native app** → use `useNativeBiometrics.authenticate()` for fingerprint/face (no server-side credential registration needed — it just verifies the device owner, then auto-logs in with stored credentials)
  - **Browser** → keep existing WebAuthn flow as fallback
- Store encrypted login token in localStorage after successful login so native biometric can re-authenticate without password
- Auto-prompt fingerprint on app open when in native mode (replace current WebAuthn auto-login)

### 2. Update biometric setup dialog

- After successful login in native app, prompt to enable fingerprint using native biometrics instead of WebAuthn
- Store a flag (`nativeBiometricEnabled`) and the user's identifier for auto-login

### 3. Add version display

- Add a small version string (from `package.json` version or build timestamp) in the footer/settings so users can verify they have the latest

## Files Changed

| Action | File |
|--------|------|
| Edit | `src/pages/Auth.tsx` — integrate native biometrics for login |
| Edit | `src/hooks/useNativeBiometrics.ts` — fix regex typo in `isNativeApp()` |
| Edit | `src/components/Footer.tsx` — add version indicator |

## Technical Detail

The native biometric flow works differently from WebAuthn:
1. User logs in with password → credentials stored securely in localStorage
2. User enables fingerprint → `nativeBiometricEnabled` flag set
3. Next app open → native fingerprint prompt appears → on success, auto-login with stored credentials
4. No server-side credential registration needed (unlike WebAuthn)

The `isNativeApp()` function has a regex issue: `/Android.*; wv\)/` — the semicolon-space pattern may not match all WebView user agents. Will fix to be more reliable.

