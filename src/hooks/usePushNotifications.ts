import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

let PushNotifications: any = null;

const INIT_DELAY_MS = 8000;
const PERMISSION_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const REGISTER_TIMEOUT_MS = 10000;

type PushListenerHandle = {
  remove?: () => Promise<void> | void;
};

const loadPushModule = async () => {
  if (PushNotifications) return true;

  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    return true;
  } catch {
    return false;
  }
};

const isNativeApp = (): boolean => {
  return !!(window as any).Capacitor?.isNativePlatform?.();
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
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
};

const scheduleInBackground = (task: () => void) => {
  const requestIdleCallback = (window as any).requestIdleCallback;

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(task, { timeout: 2000 });
    return;
  }

  window.setTimeout(task, 0);
};

const removeListenerHandles = async (handles: PushListenerHandle[]) => {
  await Promise.allSettled(
    handles.map((handle) => Promise.resolve(handle?.remove?.()))
  );
};

export const usePushNotifications = (options?: { enabled?: boolean }) => {
  const { enabled = true } = options ?? {};
  const { user, session } = useAuth();
  const registeredRef = useRef(false);
  const listenerHandlesRef = useRef<PushListenerHandle[]>([]);

  const saveToken = useCallback(async (token: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('device_tokens')
        .upsert(
          { user_id: user.id, token, platform: 'android' },
          { onConflict: 'user_id,token' }
        );

      if (error) {
        console.error('Failed to save device token:', error);
        return;
      }

      console.log('[Push] Token saved successfully');
    } catch (error) {
      console.error('Error saving device token:', error);
    }
  }, [user]);

  const attachListeners = useCallback(async () => {
    if (!PushNotifications || listenerHandlesRef.current.length > 0) return;

    const listenerResults = await Promise.allSettled([
      Promise.resolve(
        PushNotifications.addListener('registration', (token: { value: string }) => {
          console.log('[Push] Registered with token:', `${token.value.substring(0, 20)}...`);
          void saveToken(token.value);
        })
      ),
      Promise.resolve(
        PushNotifications.addListener('registrationError', (error: any) => {
          console.error('[Push] Registration error:', error);
        })
      ),
      Promise.resolve(
        PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
          console.log('[Push] Notification received:', notification);
          toast.info(notification.title || 'New notification', {
            description: notification.body,
          });
        })
      ),
      Promise.resolve(
        PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
          console.log('[Push] Notification action performed:', action);
        })
      ),
    ]);

    listenerHandlesRef.current = listenerResults
      .filter(
        (result): result is PromiseFulfilledResult<PushListenerHandle> =>
          result.status === 'fulfilled' && !!result.value
      )
      .map((result) => result.value);
  }, [saveToken]);

  const initialize = useCallback(async () => {
    try {
      if (!enabled || !isNativeApp() || registeredRef.current || !user || !session) return;

      const loaded = await loadPushModule();
      if (!loaded || !PushNotifications) {
        console.log('[Push] Push notifications module not available');
        return;
      }

      await attachListeners();

      const permissionStatus: any = await withTimeout(
        PushNotifications.checkPermissions(),
        PERMISSION_TIMEOUT_MS,
      );

      let receivePermission = permissionStatus?.receive;

      if (receivePermission === 'prompt') {
        const requestResult: any = await withTimeout(
          PushNotifications.requestPermissions(),
          REQUEST_TIMEOUT_MS,
        );
        receivePermission = requestResult?.receive;
      }

      if (receivePermission !== 'granted') {
        console.log('[Push] Permission not granted:', receivePermission);
        return;
      }

      await withTimeout(PushNotifications.register(), REGISTER_TIMEOUT_MS);
      registeredRef.current = true;
      console.log('[Push] Push notifications initialized in background');
    } catch (error) {
      console.warn('[Push] Initialization skipped (non-blocking):', error);
    }
  }, [attachListeners, enabled, session, user]);

  useEffect(() => {
    if (!enabled || !user || !session || !isNativeApp()) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;

      scheduleInBackground(() => {
        if (cancelled) return;
        void initialize();
      });
    }, INIT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const currentHandles = listenerHandlesRef.current;
      listenerHandlesRef.current = [];
      registeredRef.current = false;
      void removeListenerHandles(currentHandles);
    };
  }, [enabled, initialize, session, user]);

  return { initialize };
};
