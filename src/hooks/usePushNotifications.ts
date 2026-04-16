import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

let PushNotifications: any = null;

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

/** Wraps a promise with a timeout – rejects if not resolved in `ms` */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
};

export const usePushNotifications = () => {
  const { user, session } = useAuth();
  const registeredRef = useRef(false);

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
      } else {
        console.log('[Push] Token saved successfully');
      }
    } catch (err) {
      console.error('Error saving device token:', err);
    }
  }, [user]);

  const initialize = useCallback(async () => {
    if (!isNativeApp() || registeredRef.current || !user) return;

    const loaded = await loadPushModule();
    if (!loaded || !PushNotifications) {
      console.log('[Push] Push notifications module not available');
      return;
    }

    try {
      const permStatus = await withTimeout(PushNotifications.checkPermissions(), 5000);

      if (permStatus.receive === 'prompt') {
        const reqResult = await withTimeout(PushNotifications.requestPermissions(), 10000);
        if (reqResult.receive !== 'granted') {
          console.log('[Push] Permission denied');
          return;
        }
      } else if (permStatus.receive !== 'granted') {
        console.log('[Push] Permission not granted:', permStatus.receive);
        return;
      }

      await withTimeout(PushNotifications.register(), 10000);

      PushNotifications.addListener('registration', (token: { value: string }) => {
        console.log('[Push] Registered with token:', token.value.substring(0, 20) + '...');
        saveToken(token.value);
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('[Push] Registration error:', error);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        console.log('[Push] Notification received:', notification);
        toast.info(notification.title || 'New notification', {
          description: notification.body,
        });
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
        console.log('[Push] Notification action performed:', action);
      });

      registeredRef.current = true;
      console.log('[Push] Push notifications initialized');
    } catch (error) {
      console.warn('[Push] Initialization failed (non-blocking):', error);
    }
  }, [user, saveToken]);

  // Auto-initialize with a 5-second delay so the UI loads first
  useEffect(() => {
    if (!user || !session || !isNativeApp()) return;

    const timer = setTimeout(() => {
      // Fire-and-forget — never blocks rendering
      initialize().catch((e) => console.warn('[Push] Deferred init error:', e));
    }, 5000);

    return () => {
      clearTimeout(timer);
      if (PushNotifications && registeredRef.current) {
        PushNotifications.removeAllListeners();
        registeredRef.current = false;
      }
    };
  }, [user, session, initialize]);

  return { initialize };
};
