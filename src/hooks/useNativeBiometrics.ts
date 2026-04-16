import { useState, useCallback } from 'react';

// Dynamic imports to avoid build errors when not in native context
let BiometricAuth: any = null;
let AndroidBiometryStrength: any = null;

const loadBiometricModule = async () => {
  if (BiometricAuth) return true;
  try {
    const mod = await import('@aparajita/capacitor-biometric-auth');
    BiometricAuth = mod.BiometricAuth;
    AndroidBiometryStrength = mod.AndroidBiometryStrength;
    return true;
  } catch {
    return false;
  }
};

const isNativeApp = (): boolean => {
  return !!(window as any).Capacitor?.isNativePlatform?.();
};

export const useNativeBiometrics = () => {
  const [isLoading, setIsLoading] = useState(false);

  const isAvailable = useCallback(async (): Promise<boolean> => {
    if (!isNativeApp()) return false;
    const loaded = await loadBiometricModule();
    if (!loaded || !BiometricAuth) return false;
    try {
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable;
    } catch {
      return false;
    }
  }, []);

  const getBiometryType = useCallback(async (): Promise<string> => {
    if (!isNativeApp()) return 'none';
    const loaded = await loadBiometricModule();
    if (!loaded || !BiometricAuth) return 'none';
    try {
      const result = await BiometricAuth.checkBiometry();
      const types: Record<number, string> = {
        1: 'fingerprint', 2: 'face', 3: 'fingerprint', 4: 'face', 5: 'iris'
      };
      return types[result.biometryType] || 'biometric';
    } catch {
      return 'none';
    }
  }, []);

  const authenticate = useCallback(async (reason?: string): Promise<{ success: boolean; error?: string }> => {
    if (!isNativeApp()) {
      return { success: false, error: 'Not running in native app' };
    }

    const loaded = await loadBiometricModule();
    if (!loaded || !BiometricAuth) {
      return { success: false, error: 'Biometric module not available' };
    }

    setIsLoading(true);
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

      setIsLoading(false);
      return { success: true };
    } catch (error: any) {
      setIsLoading(false);

      if (error?.code === 'userCancel' || error?.message?.includes('cancel')) {
        return { success: false, error: 'Authentication cancelled' };
      }
      if (error?.code === 'biometryNotAvailable') {
        return { success: false, error: 'Biometric authentication not available on this device' };
      }
      if (error?.code === 'biometryNotEnrolled') {
        return { success: false, error: 'No biometric credentials enrolled. Please set up fingerprint or face unlock in your device settings.' };
      }

      console.error('Native biometric error:', error);
      return { success: false, error: error?.message || 'Biometric authentication failed' };
    }
  }, []);

  return {
    isNativeApp: isNativeApp(),
    isAvailable,
    getBiometryType,
    authenticate,
    isLoading,
  };
};
