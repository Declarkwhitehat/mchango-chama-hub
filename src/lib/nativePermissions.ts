/**
 * Lazy, non-blocking helpers for requesting native device permissions.
 *
 * Every helper:
 *  - Dynamically imports the Capacitor plugin so web builds never bundle native code.
 *  - Returns a typed result instead of throwing, so callers can branch safely.
 *  - No-ops gracefully when running outside a native (Capacitor) shell.
 */

export type PermissionResult =
  | { granted: true }
  | { granted: false; reason: 'unsupported' | 'denied' | 'error'; message?: string };

const isNativeApp = (): boolean =>
  !!(window as any).Capacitor?.isNativePlatform?.();

const fail = (
  reason: Exclude<Extract<PermissionResult, { granted: false }>['reason'], never>,
  message?: string,
): PermissionResult => ({ granted: false, reason, message });

/**
 * Camera + photo library access. Triggers the OS prompt only on first call.
 */
export const ensureCameraPermission = async (): Promise<PermissionResult> => {
  if (!isNativeApp()) return fail('unsupported');

  try {
    const { Camera } = await import('@capacitor/camera');
    const status = await Camera.checkPermissions();
    const needsPrompt =
      status.camera !== 'granted' || status.photos !== 'granted';

    if (!needsPrompt) return { granted: true };

    const result = await Camera.requestPermissions({
      permissions: ['camera', 'photos'],
    });
    const granted =
      result.camera === 'granted' && result.photos === 'granted';
    return granted ? { granted: true } : fail('denied');
  } catch (error: any) {
    console.warn('[Permissions] Camera request failed:', error);
    return fail('error', error?.message);
  }
};

/**
 * Foreground location access (coarse + fine). Background location is not requested.
 */
export const ensureLocationPermission = async (): Promise<PermissionResult> => {
  if (!isNativeApp()) return fail('unsupported');

  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const status = await Geolocation.checkPermissions();
    if (status.location === 'granted') return { granted: true };

    const result = await Geolocation.requestPermissions({
      permissions: ['location'],
    });
    return result.location === 'granted' ? { granted: true } : fail('denied');
  } catch (error: any) {
    console.warn('[Permissions] Location request failed:', error);
    return fail('error', error?.message);
  }
};

/**
 * Filesystem access for downloads / cached documents. Modern Android (API 33+)
 * does not need a runtime prompt for app-scoped storage, so this primarily
 * verifies the plugin is loadable and surfaces problems early.
 */
export const ensureStorageAvailable = async (): Promise<PermissionResult> => {
  if (!isNativeApp()) return fail('unsupported');

  try {
    await import('@capacitor/filesystem');
    return { granted: true };
  } catch (error: any) {
    console.warn('[Permissions] Filesystem unavailable:', error);
    return fail('error', error?.message);
  }
};

/**
 * Calendar permission. The official Capacitor org does not ship a calendar
 * plugin, so we attempt to resolve a community plugin lazily. If it isn't
 * installed we return `unsupported` — callers should then fall back to a
 * confirmation/email/SMS reminder rather than crashing.
 */
export const ensureCalendarPermission = async (): Promise<PermissionResult> => {
  if (!isNativeApp()) return fail('unsupported');

  try {
    // Try a few known community plugins. Each lookup is wrapped so a missing
    // module never throws into the caller.
    const candidates: Array<() => Promise<any>> = [
      () => (new Function('m', 'return import(m)'))('@ebarooni/capacitor-calendar').catch(() => null),
      () => (new Function('m', 'return import(m)'))('capacitor-plugin-calendar').catch(() => null),
    ];

    for (const load of candidates) {
      const mod = await load();
      const plugin = mod?.Calendar ?? mod?.CapacitorCalendar ?? mod?.default;
      if (!plugin) continue;

      const checker = plugin.checkPermissions ?? plugin.checkPermission;
      const requester = plugin.requestPermissions ?? plugin.requestPermission;
      if (typeof requester !== 'function') continue;

      try {
        const status = typeof checker === 'function' ? await checker() : null;
        const alreadyGranted =
          status?.calendar === 'granted' ||
          status?.readCalendar === 'granted' ||
          status?.granted === true;
        if (alreadyGranted) return { granted: true };

        const result = await requester();
        const granted =
          result?.calendar === 'granted' ||
          result?.readCalendar === 'granted' ||
          result?.granted === true;
        return granted ? { granted: true } : fail('denied');
      } catch (error: any) {
        console.warn('[Permissions] Calendar plugin call failed:', error);
        return fail('error', error?.message);
      }
    }

    return fail('unsupported', 'No Capacitor calendar plugin installed');
  } catch (error: any) {
    console.warn('[Permissions] Calendar request failed:', error);
    return fail('error', error?.message);
  }
};

/**
 * Best-effort warm-up: prepares plugins in the background after login so the
 * first user-triggered action (camera, map, etc.) is instant.
 * Never throws, never blocks the UI thread for more than a microtask.
 */
export const warmUpNativePlugins = (): void => {
  if (!isNativeApp()) return;

  const tasks = [
    () => import('@capacitor/camera'),
    () => import('@capacitor/geolocation'),
    () => import('@capacitor/filesystem'),
    () => import('@capacitor/network'),
    () => import('@capacitor/device'),
    () => import('@capacitor/share'),
  ];

  const run = () => {
    void Promise.allSettled(tasks.map((load) => load())).catch(() => {});
  };

  const requestIdleCallback = (window as any).requestIdleCallback;
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 1500);
  }
};
