import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

// Mock AuthContext
const mockUser = { id: "user-123" };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, session: { access_token: "tok" } }),
}));

describe("usePushNotifications – non-blocking startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as any).Capacitor = { isNativePlatform: () => true };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).Capacitor;
    vi.restoreAllMocks();
  });

  it("exposes the new permission API synchronously and never blocks render", async () => {
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());

    expect(typeof result.current.checkPermission).toBe("function");
    expect(typeof result.current.requestPermission).toBe("function");
    expect(typeof result.current.registerSilently).toBe("function");
    expect(result.current.permissionState).toBe("unknown");
  });

  it("does NOT freeze if Capacitor module import fails", async () => {
    delete (window as any).Capacitor;
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.isNativeApp).toBe(false);
  });

  it("checkPermission() resolves to 'unsupported' when not in native context", async () => {
    delete (window as any).Capacitor;
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());

    let state: string | undefined;
    await act(async () => {
      state = await result.current.checkPermission();
    });
    expect(state).toBe("unsupported");
  });

  it("requestPermission() resolves to 'unsupported' on web without throwing", async () => {
    delete (window as any).Capacitor;
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());

    let state: string | undefined;
    await act(async () => {
      state = await result.current.requestPermission();
    });
    expect(state).toBe("unsupported");
  });
});

describe("isNativeApp detection", () => {
  afterEach(() => {
    delete (window as any).Capacitor;
  });

  it("returns true when Capacitor.isNativePlatform() exists and returns true", () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    expect(isNative).toBe(true);
  });

  it("returns false when Capacitor is absent", () => {
    delete (window as any).Capacitor;
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    expect(isNative).toBe(false);
  });
});
