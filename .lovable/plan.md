
# Resilience & Scale Hardening Plan (target: 100k RPM)

Goal: native APK + website remain responsive and never hard-crash under sustained 100k requests/minute (~1,667 RPS) bursts. Focus on (1) preventing client crashes, (2) shrinking backend load per request, (3) absorbing spikes gracefully, (4) observability so we catch regressions early.

---

## 1. Backend capacity (Lovable Cloud / Postgres)

1.1 **Upgrade the Lovable Cloud instance** — the default compute cannot sustain 1.6k RPS of authenticated PostgREST + Edge Function traffic. User action: Backend → Advanced settings → Upgrade instance to a larger tier. I'll surface a "View Backend" CTA after the plan ships.

1.2 **Connection pooling discipline** — audit every Edge Function for `createClient` calls inside request handlers; move to module-scope singletons so PgBouncer connections aren't churned. Add a shared `getServiceClient()` helper in `supabase/functions/_shared/`.

1.3 **Slow-query sweep** — run `supabase--slow_queries`, add missing composite indexes for the hottest paths: chama_contributions(chama_id, created_at), welfare_contributions(welfare_id, created_at), donations(mchango_id, created_at), withdrawals(user_id, status), audit_logs(user_id, created_at).

1.4 **Cache hot reads at the edge** — short TTL (10–30s) in-memory cache inside Edge Functions for read-mostly endpoints (platform_settings, maintenance_modules, commission config, paybill config). Reduces 90%+ of repeated Postgres hits.

---

## 2. Client-side crash prevention

2.1 **Global ErrorBoundary already exists** — extend it to (a) report to a lightweight `client-error-log` edge function (sampled at 1%), (b) auto-retry chunk-load errors once (`ChunkLoadError` → `window.location.reload()`).

2.2 **Route-level Suspense boundaries** — wrap each lazy route in App.tsx with its own Suspense + ErrorBoundary so one page failure can't blank the whole shell.

2.3 **React Query hardening** — set global defaults: `retry: 2 with exponential backoff`, `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `networkMode: 'offlineFirst'`. Stops thundering-herd refetches.

2.4 **Request deduplication & throttling** — wrap supabase calls in a thin client that:
- coalesces identical in-flight reads
- debounces user-triggered mutations (already partially via `useDebounceAction`)
- aborts via `AbortController` when component unmounts.

2.5 **Memory leak audit** — kill setInterval/realtime subscriptions left mounted (notifications, chat, maintenance modules hook). Verify every `supabase.channel(...)` has a `removeChannel` cleanup.

---

## 3. Network resilience

3.1 **Exponential backoff + jitter** on all retries (login, OTP, STK, withdrawals). Add a shared `retryWithBackoff(fn, {retries, baseMs, jitter})` in `src/utils/retryHelpers.ts` (extend existing file).

3.2 **Offline queue for mutations** — capacitor app: queue write actions (contribution submit, chat send) when offline, flush on reconnect using `useNetworkStatus`.

3.3 **Graceful 429/503 handling** — when Edge Functions return rate-limit or module-maintenance errors, show a non-blocking toast + auto-retry after `Retry-After` header, never throw to ErrorBoundary.

3.4 **CDN-style asset caching** — confirm `vite build` outputs hashed filenames; add long `Cache-Control: immutable` via Vercel headers config for `/assets/*`. Reduces origin load drastically on cold loads.

---

## 4. Rate limiting & abuse control (server)

4.1 **Per-IP + per-user soft limits** at Edge Function layer using existing `rate_limit_attempts` table (already used by `login`, `send-otp`). Extend to: `payment-stk-push`, `b2c-payout`, `maintenance-reconcile`, `admin-sms-broadcast`. Reject with 429 + Retry-After before doing DB work.

4.2 **Idempotency keys** on all financial mutations (already in place for settlement; add to STK initiation) so accidental client retries don't double-charge.

---

## 5. Observability

5.1 **Lightweight client telemetry** — sampled error + slow-render reporter posting to a new `client-telemetry` edge function (fire-and-forget, `keepalive: true`).

5.2 **Edge function structured logs** — standardize `console.log(JSON.stringify({fn, event, latencyMs, status}))` for grep-ability in logs UI.

5.3 **Health dashboard panel** in `AdminDashboard.tsx` showing: DB connection saturation, recent 5xx rate, slowest endpoints (read from `supabase--db_health` style RPC).

---

## 6. Load test & verify

6.1 Document a k6 / autocannon script in `LOAD_TEST.md` targeting public read endpoints + STK init at 1,667 RPS for 5 minutes; record p50/p95/p99 + error rate.

6.2 Acceptance criteria: zero unhandled client exceptions, <1% 5xx, p95 < 800 ms on reads, no PgBouncer saturation > 80%.

---

## Files to touch (high-level)

- **New**: `supabase/functions/_shared/getServiceClient.ts`, `supabase/functions/_shared/edgeCache.ts`, `supabase/functions/client-telemetry/index.ts`, `src/lib/queryClient.ts` (centralize React Query defaults), `src/lib/supabaseSafeCall.ts`, `LOAD_TEST.md`, migration adding composite indexes.
- **Edit**: `src/App.tsx` (per-route Suspense + ErrorBoundary), `src/components/ErrorBoundary.tsx` (chunk-error reload + telemetry), `src/main.tsx` (queryClient defaults), `src/hooks/useMaintenanceModules.ts` and other realtime hooks (cleanup), `src/utils/retryHelpers.ts`, edge functions listed in §1.2 and §4.1, `src/pages/AdminDashboard.tsx`.
- **User-action prompt**: upgrade Lovable Cloud instance size (cannot be done from code).

---

## Out of scope (call out to user)

- Horizontal scaling beyond the largest Lovable Cloud tier (would need migration to dedicated infra).
- M-Pesa Daraja's own rate limits — Safaricom caps STK throughput independently; we can queue but not exceed their quota.
- Native APK crashes caused by device OS killing background processes (Android OEM-specific).

Approve and I'll execute in this order: capacity & indexes → client resilience → rate limiting → telemetry → load test doc.
