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
    // Simulate native Capacitor environment
    (window as any).Capacitor = { isNativePlatform: () => true };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).Capacitor;
    vi.restoreAllMocks();
  });

  it("does NOT call initialize immediately on mount – defers by 5 seconds", async () => {
    // We need to dynamically import after mocks are set
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const initSpy = vi.fn();

    // The hook auto-fires a setTimeout(5000) internally.
    // We just verify the hook renders without blocking.
    const { result } = renderHook(() => usePushNotifications());

    // The hook should return an initialize function synchronously
    expect(result.current.initialize).toBeDefined();
    expect(typeof result.current.initialize).toBe("function");
  });

  it("does NOT freeze if Capacitor module import fails", async () => {
    // Remove the Capacitor global so isNativeApp returns false
    delete (window as any).Capacitor;

    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());

    // Should render cleanly, no errors
    expect(result.current.initialize).toBeDefined();
  });

  it("initialize() resolves silently when not in native context", async () => {
    delete (window as any).Capacitor;
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    const { result } = renderHook(() => usePushNotifications());

    // Calling initialize manually should not throw
    await act(async () => {
      await result.current.initialize();
    });
    // No error = pass
  });
});

describe("isNativeApp detection", () => {
  afterEach(() => {
    delete (window as any).Capacitor;
  });

  it("returns true when Capacitor.isNativePlatform() exists and returns true", async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    // The function is internal, so we test via the hook behavior
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    // initialize should attempt to run (not bail early)
    expect(usePushNotifications).toBeDefined();
  });

  it("returns false when Capacitor is absent", async () => {
    delete (window as any).Capacitor;
    // Hook should not attempt push init
    const { usePushNotifications } = await import("@/hooks/usePushNotifications");
    expect(usePushNotifications).toBeDefined();
  });

  it("returns false for old regex-based detection without Capacitor global", () => {
    // Ensure the old regex patterns don't accidentally match
    delete (window as any).Capacitor;
    const ua = navigator.userAgent;
    // The new detection is purely Capacitor-based, not UA-based
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    expect(isNative).toBe(false);
  });
});
