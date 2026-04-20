// Centralized helpers for native (Capacitor) biometric session storage.
// Single source of truth for `nativeBiometricEnabled` + `biometricSession`.
//
// Why this exists:
// Supabase refresh tokens are one-time-use and rotate. If we save a snapshot
// once and never update it, that stored refresh_token becomes invalid the
// next time the SDK silently rotates tokens — which produces the
// "Your session has expired. Please log in again." loop after fingerprint
// login. To prevent that, every time the auth state changes to a valid
// session we re-save the latest tokens here.

import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "biometricSession";
const ENABLED_KEY = "nativeBiometricEnabled";

export interface StoredBiometricSession {
  access_token: string;
  refresh_token: string;
}

export const isNativeBiometricEnabled = (): boolean => {
  try {
    return (
      localStorage.getItem(ENABLED_KEY) === "true" &&
      !!localStorage.getItem(SESSION_KEY)
    );
  } catch {
    return false;
  }
};

export const getStoredBiometricSession = (): StoredBiometricSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
    return null;
  } catch {
    return null;
  }
};

export const writeBiometricSession = (
  session: StoredBiometricSession,
  enable = false
) => {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    );
    if (enable) localStorage.setItem(ENABLED_KEY, "true");
  } catch (err) {
    console.error("Failed to write biometric session:", err);
  }
};

export const clearBiometricSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // ignore
  }
};

/**
 * Save a fresh snapshot of the current Supabase session for biometric login.
 * Call this immediately after a successful sign-in / 2FA / token refresh so
 * the stored refresh_token never goes stale.
 */
export const saveCurrentSessionForBiometric = async (
  enable = false
): Promise<boolean> => {
  try {
    // Only update the "enabled" flag if explicitly enabling. Otherwise we
    // just refresh the saved tokens when biometric is already enabled — we
    // do NOT silently enable biometric on every sign-in.
    if (!enable && !isNativeBiometricEnabled()) return false;

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token || !session.refresh_token) return false;

    writeBiometricSession(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      enable
    );
    return true;
  } catch (err) {
    console.error("saveCurrentSessionForBiometric error:", err);
    return false;
  }
};

/**
 * Restore a Supabase session from the saved biometric snapshot.
 * Always tries the refresh_token first (most robust), falls back to setSession.
 * On success, the freshly rotated tokens are written back to storage.
 * On hard failure, biometric storage is cleared so we don't loop.
 */
export const restoreSessionFromBiometric = async (): Promise<boolean> => {
  const stored = getStoredBiometricSession();
  if (!stored) return false;

  // Strategy 1: refresh using the stored refresh_token. This is the most
  // forgiving path and works even if the access_token expired long ago.
  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: stored.refresh_token,
    });

    if (!error && data.session?.access_token && data.session.refresh_token) {
      writeBiometricSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      return true;
    }
  } catch (err) {
    console.warn("Biometric refresh failed, trying setSession:", err);
  }

  // Strategy 2: setSession with stored tokens (in case refresh API rejected
  // but the access_token is still valid).
  try {
    const { error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (!error) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session.refresh_token) {
        writeBiometricSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        return true;
      }
    }
  } catch (err) {
    console.error("Biometric setSession failed:", err);
  }

  // Both strategies failed → stored tokens are unusable. Clear them so the
  // user gets a clean re-enrollment instead of a permanent loop.
  clearBiometricSession();
  return false;
};
