/**
 * Biometric Handler Module
 * Wraps @aparajita/capacitor-biometric-auth with lazy loading.
 * Provides authenticate() and checkAvailability() for the app-lock flow.
 */

let BiometricAuth: any = null;
let AndroidBiometryStrength: any = null;
let loaded = false;

const loadModule = async (): Promise<boolean> => {
  if (loaded) return !!BiometricAuth;
  loaded = true;
  try {
    const mod = await import('@aparajita/capacitor-biometric-auth');
    BiometricAuth = mod.BiometricAuth;
    AndroidBiometryStrength = mod.AndroidBiometryStrength;
    return true;
  } catch {
    return false;
  }
};

export const isNativeApp = (): boolean =>
  !!(window as any).Capacitor?.isNativePlatform?.();

/** Check if biometric hardware is available and enrolled. */
export const checkBiometricAvailability = async (): Promise<boolean> => {
  if (!isNativeApp()) return false;
  const ok = await loadModule();
  if (!ok || !BiometricAuth) return false;
  try {
    const result = await BiometricAuth.checkBiometry();
    return result.isAvailable;
  } catch {
    return false;
  }
};

/** Get the type of biometric available (fingerprint, face, etc). */
export const getBiometricType = async (): Promise<string> => {
  if (!isNativeApp()) return 'none';
  const ok = await loadModule();
  if (!ok || !BiometricAuth) return 'none';
  try {
    const result = await BiometricAuth.checkBiometry();
    const types: Record<number, string> = {
      1: 'fingerprint', 2: 'face', 3: 'fingerprint', 4: 'face', 5: 'iris',
    };
    return types[result.biometryType] || 'biometric';
  } catch {
    return 'none';
  }
};

/** Trigger biometric prompt. Returns { success, error? }. */
export const authenticateBiometric = async (
  reason?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isNativeApp()) {
    return { success: false, error: 'Not running in native app' };
  }

  const ok = await loadModule();
  if (!ok || !BiometricAuth) {
    return { success: false, error: 'Biometric module not available' };
  }

  try {
    await BiometricAuth.authenticate({
      reason: reason || 'Confirm your identity to continue',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      androidConfirmationRequired: false,
      ...(AndroidBiometryStrength && {
        androidBiometryStrength: AndroidBiometryStrength.weak,
      }),
    });
    return { success: true };
  } catch (error: any) {
    if (error?.code === 'userCancel' || error?.message?.includes('cancel')) {
      return { success: false, error: 'Authentication cancelled' };
    }
    if (error?.code === 'biometryNotAvailable') {
      return { success: false, error: 'Biometric authentication not available on this device' };
    }
    if (error?.code === 'biometryNotEnrolled') {
      return { success: false, error: 'No biometric credentials enrolled. Please set up fingerprint or face unlock in your device settings.' };
    }
    console.error('Biometric error:', error);
    return { success: false, error: error?.message || 'Biometric authentication failed' };
  }
};
