/**
 * Native download completion notifications using Capacitor LocalNotifications.
 * Shows a system notification when a PDF/document download completes on native.
 */

const isNative = (): boolean =>
  !!(window as any).Capacitor?.isNativePlatform?.();

let LocalNotifications: any = null;
let pluginLoaded = false;

const loadPlugin = async () => {
  if (pluginLoaded) return !!LocalNotifications;
  pluginLoaded = true;
  try {
    const mod = await import('@capacitor/local-notifications');
    LocalNotifications = mod.LocalNotifications;
    return true;
  } catch {
    return false;
  }
};

/**
 * Show a native notification that a document download is complete.
 */
export const notifyDownloadComplete = async (filename: string) => {
  if (!isNative()) return;

  const loaded = await loadPlugin();
  if (!loaded || !LocalNotifications) return;

  try {
    // Request permission if needed
    const permResult = await LocalNotifications.checkPermissions();
    if (permResult.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Download Complete',
          body: `${filename} has been downloaded successfully`,
          id: Date.now() % 2147483647, // unique int32 id
          schedule: { at: new Date(Date.now() + 500) },
          sound: undefined,
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#10B981',
        },
      ],
    });
  } catch (e) {
    console.warn('[DownloadNotification] Failed:', e);
  }
};
