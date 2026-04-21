/**
 * App Initialization Logic
 * Checks stored state on app start and determines if biometric unlock
 * should be triggered, or if user needs full password login.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  getStoredSession,
  isBiometricEnabled,
  isAppLocked,
  setAppLocked,
  setStoredSession,
  hardLogoutStorage,
  debugStorageState,
} from './secureStorage';
import { authenticateBiometric, getBiometricType, isNativeApp } from './biometricHandler';

export interface AppStartResult {
  /** Whether there's an active, valid Supabase session after init. */
  authenticated: boolean;
  /** Whether app was locked and biometric unlock was attempted. */
  biometricAttempted: boolean;
  /** If biometric was attempted, did it succeed? */
  biometricSuccess: boolean;
  /** Error message if any. */
  error?: string;
}

/**
 * Run on every app start / resume.
 * 1. Log storage state for debugging.
 * 2. If token + biometric + locked → trigger biometric.
 * 3. If biometric succeeds → restore session via refresh_token.
 * 4. On failure → stay locked.
 */
export const initializeAppAuth = async (): Promise<AppStartResult> => {
  // Debug log
  await debugStorageState();

  if (!isNativeApp()) {
    return { authenticated: false, biometricAttempted: false, biometricSuccess: false };
  }

  const storedSession = await getStoredSession();
  const biometricOn = await isBiometricEnabled();
  const locked = await isAppLocked();

  console.log('[AppInit]', { hasToken: !!storedSession, biometricOn, locked });

  // No token → need full login
  if (!storedSession) {
    return { authenticated: false, biometricAttempted: false, biometricSuccess: false };
  }

  // Token exists but not locked (app was not soft-logged-out)
  // Validate and restore silently
  if (!locked) {
    const restored = await restoreSession(storedSession);
    return {
      authenticated: restored,
      biometricAttempted: false,
      biometricSuccess: false,
    };
  }

  // Token + locked → attempt biometric if enabled
  if (biometricOn) {
    const bioType = await getBiometricType();
    const result = await authenticateBiometric(
      `Scan your ${bioType} to unlock PAMOJA NOVA`
    );

    if (result.success) {
      const restored = await restoreSession(storedSession);
      if (restored) {
        await setAppLocked(false);
        return { authenticated: true, biometricAttempted: true, biometricSuccess: true };
      }
      // Token was invalid despite biometric success
      return {
        authenticated: false,
        biometricAttempted: true,
        biometricSuccess: true,
        error: 'Session expired. Please log in with your password.',
      };
    }

    // Biometric failed/cancelled
    return {
      authenticated: false,
      biometricAttempted: true,
      biometricSuccess: false,
      error: result.error,
    };
  }

  // Locked but biometric not enabled → need password
  return { authenticated: false, biometricAttempted: false, biometricSuccess: false };
};

/**
 * Restore a Supabase session from stored tokens.
 * Tries refreshSession first, falls back to setSession.
 * On success, updates the stored tokens with the fresh rotated ones.
 */
async function restoreSession(stored: { access_token: string; refresh_token: string }): Promise<boolean> {
  // Strategy 1: refresh with stored refresh_token
  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: stored.refresh_token,
    });
    if (!error && data.session?.access_token && data.session.refresh_token) {
      await setStoredSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      return true;
    }
  } catch (err) {
    console.warn('[AppInit] refreshSession failed:', err);
  }

  // Strategy 2: setSession
  try {
    const { error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (!error) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session.refresh_token) {
        await setStoredSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        return true;
      }
    }
  } catch (err) {
    console.error('[AppInit] setSession failed:', err);
  }

  // Both failed → tokens are stale
  await hardLogoutStorage();
  return false;
}
