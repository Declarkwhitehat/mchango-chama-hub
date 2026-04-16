import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the biometric module to simulate device with fingerprint
const mockCheckBiometry = vi.fn();
const mockAuthenticate = vi.fn();

vi.mock("@aparajita/capacitor-biometric-auth", () => ({
  BiometricAuth: {
    checkBiometry: (...args: any[]) => mockCheckBiometry(...args),
    authenticate: (...args: any[]) => mockAuthenticate(...args),
  },
  AndroidBiometryStrength: { weak: 1 },
}));

describe("useNativeBiometrics", () => {
  beforeEach(() => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    mockCheckBiometry.mockReset();
    mockAuthenticate.mockReset();
  });

  afterEach(() => {
    delete (window as any).Capacitor;
    vi.restoreAllMocks();
  });

  it("isNativeApp is true when Capacitor global exists", async () => {
    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());
    expect(result.current.isNativeApp).toBe(true);
  });

  it("isNativeApp is false when Capacitor is absent", async () => {
    delete (window as any).Capacitor;
    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());
    expect(result.current.isNativeApp).toBe(false);
  });

  it("isAvailable returns true when device has biometrics enrolled", async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: true, biometryType: 1 });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let available = false;
    await act(async () => {
      available = await result.current.isAvailable();
    });
    expect(available).toBe(true);
    // Should only be called ONCE (duplicate was removed)
    expect(mockCheckBiometry).toHaveBeenCalledTimes(1);
  });

  it("isAvailable returns false when biometrics not enrolled", async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: false, biometryType: 0 });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let available = false;
    await act(async () => {
      available = await result.current.isAvailable();
    });
    expect(available).toBe(false);
  });

  it("isAvailable returns false when not in native app", async () => {
    delete (window as any).Capacitor;
    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let available = false;
    await act(async () => {
      available = await result.current.isAvailable();
    });
    expect(available).toBe(false);
    expect(mockCheckBiometry).not.toHaveBeenCalled();
  });

  it("getBiometryType returns 'fingerprint' for type 1", async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: true, biometryType: 1 });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let type = "none";
    await act(async () => {
      type = await result.current.getBiometryType();
    });
    expect(type).toBe("fingerprint");
  });

  it("getBiometryType returns 'face' for type 2", async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: true, biometryType: 2 });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let type = "none";
    await act(async () => {
      type = await result.current.getBiometryType();
    });
    expect(type).toBe("face");
  });

  it("authenticate succeeds when biometric verification passes", async () => {
    mockAuthenticate.mockResolvedValue(undefined); // success = no throw

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let authResult: any;
    await act(async () => {
      authResult = await result.current.authenticate("Test reason");
    });
    expect(authResult.success).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("authenticate returns error when user cancels", async () => {
    mockAuthenticate.mockRejectedValue({ code: "userCancel", message: "User cancel" });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let authResult: any;
    await act(async () => {
      authResult = await result.current.authenticate();
    });
    expect(authResult.success).toBe(false);
    expect(authResult.error).toContain("cancelled");
    expect(result.current.isLoading).toBe(false);
  });

  it("authenticate returns error when biometrics not available", async () => {
    mockAuthenticate.mockRejectedValue({ code: "biometryNotAvailable" });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let authResult: any;
    await act(async () => {
      authResult = await result.current.authenticate();
    });
    expect(authResult.success).toBe(false);
    expect(authResult.error).toContain("not available");
  });

  it("authenticate returns error when biometrics not enrolled", async () => {
    mockAuthenticate.mockRejectedValue({ code: "biometryNotEnrolled" });

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    let authResult: any;
    await act(async () => {
      authResult = await result.current.authenticate();
    });
    expect(authResult.success).toBe(false);
    expect(authResult.error).toContain("No biometric credentials enrolled");
  });

  it("never blocks rendering even if checkBiometry throws", async () => {
    mockCheckBiometry.mockRejectedValue(new Error("Plugin not installed"));

    const { useNativeBiometrics } = await import("@/hooks/useNativeBiometrics");
    const { result } = renderHook(() => useNativeBiometrics());

    // Should not throw, just return false
    let available = true;
    await act(async () => {
      available = await result.current.isAvailable();
    });
    expect(available).toBe(false);
  });
});
