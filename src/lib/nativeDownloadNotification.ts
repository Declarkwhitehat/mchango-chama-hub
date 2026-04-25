/**
 * Native download helpers.
 *
 * On Android (Capacitor) the default jsPDF `doc.save()` triggers a WebView
 * download that the user can't easily find. These helpers:
 *   1. Save the PDF blob to the public Downloads/ folder so it shows up in
 *      the system Files app.
 *   2. Immediately open the file with the system viewer (e.g. Drive PDF
 *      viewer) so the user sees their document right away.
 *   3. Show a system notification confirming the download.
 *
 * On the web everything degrades gracefully to the standard browser download.
 */

import { toast } from "sonner";

const isNative = (): boolean =>
  !!(window as any).Capacitor?.isNativePlatform?.();

let LocalNotifications: any = null;
let localNotifLoaded = false;

const loadLocalNotifications = async () => {
  if (localNotifLoaded) return !!LocalNotifications;
  localNotifLoaded = true;
  try {
    const mod = await import('@capacitor/local-notifications');
    LocalNotifications = mod.LocalNotifications;
    return true;
  } catch {
    return false;
  }
};

let Filesystem: any = null;
let FilesystemDirectoryEnum: any = null;
let fsLoaded = false;

const loadFilesystem = async () => {
  if (fsLoaded) return !!Filesystem;
  fsLoaded = true;
  try {
    const mod: any = await import('@capacitor/filesystem');
    Filesystem = mod.Filesystem;
    FilesystemDirectoryEnum = mod.Directory;
    return true;
  } catch {
    return false;
  }
};

let FileOpener: any = null;
let fileOpenerLoaded = false;

const loadFileOpener = async () => {
  if (fileOpenerLoaded) return !!FileOpener;
  fileOpenerLoaded = true;
  try {
    const mod: any = await import('@capacitor-community/file-opener');
    FileOpener = mod.FileOpener;
    return true;
  } catch {
    return false;
  }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip data:*/*;base64,
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Show a native notification that a document download is complete.
 */
export const notifyDownloadComplete = async (filename: string) => {
  if (!isNative()) return;
  const loaded = await loadLocalNotifications();
  if (!loaded || !LocalNotifications) return;

  try {
    const permResult = await LocalNotifications.checkPermissions();
    if (permResult.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Download Complete',
          body: `${filename} has been saved to Downloads`,
          id: Date.now() % 2147483647,
          schedule: { at: new Date(Date.now() + 300) },
          smallIcon: 'ic_stat_icon_config_sample',
          iconColor: '#10B981',
        },
      ],
    });
  } catch (e) {
    console.warn('[DownloadNotification] Failed:', e);
  }
};

/**
 * Save a PDF blob to the public Downloads folder and open it with the
 * system PDF viewer. Falls back to a regular browser download on web.
 *
 * @param blob     The PDF blob (e.g. from `doc.output('blob')`).
 * @param filename Desired file name (with or without `.pdf`).
 */
export const savePdfNative = async (blob: Blob, filename: string): Promise<void> => {
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (!isNative()) {
    // Web fallback — trigger browser download.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const fsReady = await loadFilesystem();
  if (!fsReady || !Filesystem || !FilesystemDirectoryEnum) {
    // Last resort fallback if Filesystem plugin isn't available
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  try {
    const base64 = await blobToBase64(blob);

    // Try public Documents directory first (visible in Files app).
    let directory = FilesystemDirectoryEnum.Documents;
    let writeResult: any;
    try {
      writeResult = await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory,
        recursive: true,
      });
    } catch (err) {
      // Fall back to External directory if Documents is not writable.
      directory = FilesystemDirectoryEnum.External ?? FilesystemDirectoryEnum.Data;
      writeResult = await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory,
        recursive: true,
      });
    }

    const fileUri: string | undefined = writeResult?.uri;

    // Notify user
    await notifyDownloadComplete(safeName);
    toast.success(`Saved to Downloads: ${safeName}`);

    // Try to open immediately
    if (fileUri) {
      const openerReady = await loadFileOpener();
      if (openerReady && FileOpener) {
        try {
          await FileOpener.open({
            filePath: fileUri,
            contentType: 'application/pdf',
            openWithDefault: true,
          });
        } catch (openErr) {
          console.warn('[savePdfNative] FileOpener failed:', openErr);
          toast.info('PDF saved. Open it from your Files app under Documents.');
        }
      } else {
        toast.info('PDF saved. Open it from your Files app under Documents.');
      }
    }
  } catch (err) {
    console.error('[savePdfNative] Failed:', err);
    toast.error('Could not save PDF to device');
  }
};
