/**
 * Secure Storage Module using @capacitor/preferences
 * Persists biometric/app-lock state across app restarts on native.
 * Falls back to localStorage on web.
 */

const isNative = (): boolean =>
  !!(window as any).Capacitor?.isNativePlatform?.();

let Preferences: any = null;
let pluginLoaded = false;

const loadPlugin = async (): Promise<boolean> => {
  if (pluginLoaded) return !!Preferences;
  pluginLoaded = true;
  try {
    const mod = await import('@capacitor/preferences');
    Preferences = mod.Preferences;
    return true;
  } catch {
    return false;
  }
};

// ── Low-level get / set / remove ──────────────────────────────────

export const secureGet = async (key: string): Promise<string | null> => {
  if (isNative()) {
    const ok = await loadPlugin();
    if (ok && Preferences) {
      const { value } = await Preferences.get({ key });
      return value;
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const secureSet = async (key: string, value: string): Promise<void> => {
  if (isNative()) {
    const ok = await loadPlugin();
    if (ok && Preferences) {
      await Preferences.set({ key, value });
      return;
    }
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export const secureRemove = async (key: string): Promise<void> => {
  if (isNative()) {
    const ok = await loadPlugin();
    if (ok && Preferences) {
      await Preferences.remove({ key });
      return;
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// ── Storage Keys ──────────────────────────────────────────────────

const KEYS = {
  SESSION_TOKEN: 'applock_session',        // JSON { access_token, refresh_token }
  BIOMETRIC_ENABLED: 'applock_biometric',   // "true" | absent
  APP_LOCKED: 'applock_locked',             // "true" | absent
} as const;

// ── Typed helpers ─────────────────────────────────────────────────

export interface StoredSession {
  access_token: string;
  refresh_token: string;
}

/** Read the stored session tokens (async – uses Preferences on native). */
export const getStoredSession = async (): Promise<StoredSession | null> => {
  const raw = await secureGet(KEYS.SESSION_TOKEN);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
    return null;
  } catch {
    return null;
  }
};

/** Write session tokens to secure storage. */
export const setStoredSession = async (session: StoredSession): Promise<void> => {
  await secureSet(
    KEYS.SESSION_TOKEN,
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
  );
};

/** Remove session tokens. */
export const clearStoredSession = async (): Promise<void> => {
  await secureRemove(KEYS.SESSION_TOKEN);
};

/** Check if biometric unlock is enabled. */
export const isBiometricEnabled = async (): Promise<boolean> => {
  const val = await secureGet(KEYS.BIOMETRIC_ENABLED);
  return val === 'true';
};

/** Synchronous check for UI rendering (localStorage fallback only). */
export const isBiometricEnabledSync = (): boolean => {
  try {
    return localStorage.getItem(KEYS.BIOMETRIC_ENABLED) === 'true';
  } catch {
    return false;
  }
};

/** Enable biometric unlock flag. */
export const setBiometricEnabled = async (enabled: boolean): Promise<void> => {
  if (enabled) {
    await secureSet(KEYS.BIOMETRIC_ENABLED, 'true');
    // Also write to localStorage for sync reads
    try { localStorage.setItem(KEYS.BIOMETRIC_ENABLED, 'true'); } catch {}
  } else {
    await secureRemove(KEYS.BIOMETRIC_ENABLED);
    try { localStorage.removeItem(KEYS.BIOMETRIC_ENABLED); } catch {}
  }
};

/** Check if app is in locked state (soft logout). */
export const isAppLocked = async (): Promise<boolean> => {
  const val = await secureGet(KEYS.APP_LOCKED);
  return val === 'true';
};

/** Synchronous check for initial render. */
export const isAppLockedSync = (): boolean => {
  try {
    return localStorage.getItem(KEYS.APP_LOCKED) === 'true';
  } catch {
    return false;
  }
};

/** Set the app lock state. */
export const setAppLocked = async (locked: boolean): Promise<void> => {
  if (locked) {
    await secureSet(KEYS.APP_LOCKED, 'true');
    try { localStorage.setItem(KEYS.APP_LOCKED, 'true'); } catch {}
  } else {
    await secureRemove(KEYS.APP_LOCKED);
    try { localStorage.removeItem(KEYS.APP_LOCKED); } catch {}
  }
};

/** Hard logout: wipe everything. */
export const hardLogoutStorage = async (): Promise<void> => {
  await clearStoredSession();
  await setBiometricEnabled(false);
  await setAppLocked(false);
};

/** Debug: log current storage state. */
export const debugStorageState = async (): Promise<void> => {
  const session = await getStoredSession();
  const biometric = await isBiometricEnabled();
  const locked = await isAppLocked();
  console.log('[AppLock] Storage State:', {
    hasToken: !!session,
    biometricEnabled: biometric,
    appLocked: locked,
  });
};
