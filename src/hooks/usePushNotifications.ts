import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Push notifications hook (native-only, never crashes the app).
 *
 * Architecture:
 *  - Permission check, permission request, and registration are SEPARATE.
 *  - Auto-register silently ONLY when permission is already granted.
 *  - Explicit `requestPermission()` for user-triggered enablement.
 *  - All native calls are deferred to idle time AFTER auth is stable.
 *  - Listeners are attached once and cleaned up safely.
 *  - Every failure path is swallowed and logged; the UI never crashes.
 */

let PushNotifications: any = null;

const INIT_DELAY_MS = 2000;
const PERMISSION_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const REGISTER_TIMEOUT_MS = 10000;

type PushListenerHandle = { remove?: () => Promise<void> | void };
type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

const loadPushModule = async (): Promise<boolean> => {
  if (PushNotifications) return true;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    return true;
  } catch {
    return false;
  }
};

const isNativeApp = (): boolean =>
  !!(window as any).Capacitor?.isNativePlatform?.();

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Timeout')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });

const scheduleInBackground = (task: () => void) => {
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(task, { timeout: 2000 });
  } else {
    window.setTimeout(task, 0);
  }
};

const removeListenerHandles = async (handles: PushListenerHandle[]) => {
  await Promise.allSettled(
    handles.map((h) => Promise.resolve(h?.remove?.())),
  );
};

export const usePushNotifications = (options?: { enabled?: boolean }) => {
  const { enabled = true } = options ?? {};
  const { user, session } = useAuth();
  const registeredRef = useRef(false);
  const listenerHandlesRef = useRef<PushListenerHandle[]>([]);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');

  const saveToken = useCallback(async (token: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          { user_id: user.id, token, platform: 'android' },
          { onConflict: 'user_id,token' },
        );
      if (error) console.error('[Push] Failed to save device token:', error);
    } catch (error) {
      console.error('[Push] Error saving device token:', error);
    }
  }, [user]);

  const attachListeners = useCallback(async () => {
    if (!PushNotifications || listenerHandlesRef.current.length > 0) return;

    const results = await Promise.allSettled([
      Promise.resolve(
        PushNotifications.addListener('registration', (token: { value: string }) => {
          console.log('[Push] Registered:', `${token.value.substring(0, 20)}...`);
          void saveToken(token.value);
        }),
      ),
      Promise.resolve(
        PushNotifications.addListener('registrationError', (error: any) => {
          console.warn('[Push] Registration error (non-fatal):', error);
        }),
      ),
      Promise.resolve(
        PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
          toast.info(notification.title || 'New notification', {
            description: notification.body,
          });
        }),
      ),
      Promise.resolve(
        PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
          console.log('[Push] Action performed:', action);
        }),
      ),
    ]);

    listenerHandlesRef.current = results
      .filter((r): r is PromiseFulfilledResult<PushListenerHandle> => r.status === 'fulfilled' && !!r.value)
      .map((r) => r.value);
  }, [saveToken]);

  /** Pure check — never prompts. Safe to call anywhere. */
  const checkPermission = useCallback(async (): Promise<PermissionState> => {
    if (!isNativeApp()) {
      setPermissionState('unsupported');
      return 'unsupported';
    }
    try {
      const loaded = await loadPushModule();
      if (!loaded) {
        setPermissionState('unsupported');
        return 'unsupported';
      }
      const status: any = await withTimeout(
        PushNotifications.checkPermissions(),
        PERMISSION_TIMEOUT_MS,
      );
      const next = (status?.receive as PermissionState) ?? 'unknown';
      setPermissionState(next);
      return next;
    } catch (error) {
      console.warn('[Push] checkPermission failed (non-fatal):', error);
      setPermissionState('unknown');
      return 'unknown';
    }
  }, []);

  /** Background registration — assumes permission is already granted. */
  const registerSilently = useCallback(async (): Promise<boolean> => {
    if (!isNativeApp() || registeredRef.current) return registeredRef.current;
    try {
      const loaded = await loadPushModule();
      if (!loaded) return false;
      await attachListeners();

      // Ensure the 'transactions' channel exists so high-priority banners + sound work on Android 8+
      try {
        await PushNotifications.createChannel?.({
          id: 'transactions',
          name: 'Transactions & Alerts',
          description: 'Payments, withdrawals, donations, reminders and other important alerts',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
        });
      } catch (chanErr) {
        console.warn('[Push] createChannel failed (non-fatal):', chanErr);
      }

      await withTimeout(PushNotifications.register(), REGISTER_TIMEOUT_MS);
      registeredRef.current = true;
      console.log('[Push] Registered silently');
      return true;
    } catch (error) {
      console.warn('[Push] Silent registration failed (non-fatal):', error);
      return false;
    }
  }, [attachListeners]);

  /** User-triggered: prompts the OS, then registers. */
  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (!isNativeApp()) return 'unsupported';
    try {
      const loaded = await loadPushModule();
      if (!loaded) return 'unsupported';
      await attachListeners();

      const result: any = await withTimeout(
        PushNotifications.requestPermissions(),
        REQUEST_TIMEOUT_MS,
      );
      const next = (result?.receive as PermissionState) ?? 'denied';
      setPermissionState(next);

      if (next === 'granted') {
        // Register in background — never block the caller.
        scheduleInBackground(() => {
          void registerSilently();
        });
      }
      return next;
    } catch (error) {
      console.warn('[Push] requestPermission failed (non-fatal):', error);
      return 'denied';
    }
  }, [attachListeners, registerSilently]);

  // Auto-init: check permission on mount, register silently if already granted.
  useEffect(() => {
    if (!enabled || !user || !session || !isNativeApp()) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      scheduleInBackground(async () => {
        if (cancelled) return;
        try {
          const state = await checkPermission();
          if (cancelled) return;
          if (state === 'granted') {
            await registerSilently();
          } else if (state === 'prompt') {
            // First login on this device → actively prompt the user so they
            // see the OS "Allow notifications" dialog right after sign-in.
            const next = await requestPermission();
            if (cancelled) return;
            if (next === 'granted') {
              await registerSilently();
            }
          }
          // 'denied' → user already declined. UI must offer a re-enable button.
        } catch (error) {
          console.warn('[Push] auto-init skipped (non-fatal):', error);
        }
      });
    }, INIT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const handles = listenerHandlesRef.current;
      listenerHandlesRef.current = [];
      registeredRef.current = false;
      void removeListenerHandles(handles);
    };
  }, [enabled, user, session, checkPermission, registerSilently, requestPermission]);

  return {
    permissionState,
    checkPermission,
    requestPermission,
    registerSilently,
    isNativeApp: isNativeApp(),
  };
};
