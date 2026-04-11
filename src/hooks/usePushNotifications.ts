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
  return !!(window as any).Capacitor || /Android.*; wv\)/.test(navigator.userAgent);
};

export const usePushNotifications = () => {
  const { user, session } = useAuth();
  const registeredRef = useRef(false);

  const saveToken = useCallback(async (token: string) => {
    if (!user) return;
    try {
      // Upsert: if token already exists for this user, update it
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
      // Check current permission status
      const permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        const reqResult = await PushNotifications.requestPermissions();
        if (reqResult.receive !== 'granted') {
          console.log('[Push] Permission denied');
          return;
        }
      } else if (permStatus.receive !== 'granted') {
        console.log('[Push] Permission not granted:', permStatus.receive);
        return;
      }

      // Register for push notifications
      await PushNotifications.register();

      // Listen for registration success
      PushNotifications.addListener('registration', (token: { value: string }) => {
        console.log('[Push] Registered with token:', token.value.substring(0, 20) + '...');
        saveToken(token.value);
      });

      // Listen for registration errors
      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('[Push] Registration error:', error);
      });

      // Listen for incoming notifications (app in foreground)
      PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        console.log('[Push] Notification received:', notification);
        toast.info(notification.title || 'New notification', {
          description: notification.body,
        });
      });

      // Listen for notification taps (app was in background)
      PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
        console.log('[Push] Notification action performed:', action);
        // Could navigate to specific page based on action.notification.data
      });

      registeredRef.current = true;
      console.log('[Push] Push notifications initialized');
    } catch (error) {
      console.error('[Push] Initialization error:', error);
    }
  }, [user, saveToken]);

  // Auto-initialize when user logs in
  useEffect(() => {
    if (user && session && isNativeApp()) {
      initialize();
    }

    // Cleanup on unmount
    return () => {
      if (PushNotifications && registeredRef.current) {
        PushNotifications.removeAllListeners();
        registeredRef.current = false;
      }
    };
  }, [user, session, initialize]);

  return { initialize };
};
