/**
 * Custom storage adapter for Supabase auth that uses @capacitor/preferences
 * on native platforms (survives Android WebView memory pressure) and falls
 * back to localStorage on web.
 *
 * The Supabase JS client v2 supports async storage (getItem/setItem/removeItem
 * may return Promises).
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

export const capacitorStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
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
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isNative()) {
      const ok = await loadPlugin();
      if (ok && Preferences) {
        await Preferences.set({ key, value });
        // Also mirror to localStorage for sync reads (best-effort)
        try { localStorage.setItem(key, value); } catch {}
        return;
      }
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isNative()) {
      const ok = await loadPlugin();
      if (ok && Preferences) {
        await Preferences.remove({ key });
        try { localStorage.removeItem(key); } catch {}
        return;
      }
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
