// Tiny in-memory TTL cache for read-mostly Edge Function lookups.
// Lives per-isolate; values evaporate on cold start (acceptable).
//
// Usage:
//   const settings = await cached("platform_settings", 20_000, async () => {
//     const { data } = await supabase.from("platform_settings").select("*").maybeSingle();
//     return data;
//   });

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  // Coalesce concurrent loads to a single promise.
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function invalidate(key: string) {
  store.delete(key);
}

export function clearAll() {
  store.clear();
}
