---
name: Resilience & Scale Hardening
description: Platform-wide patterns and thresholds for surviving 100k RPM without crashes
type: feature
---

Target capacity: ~100k requests/minute (~1,667 RPS) with zero unhandled client crashes and <1% 5xx.

## Client (React/Capacitor)
- React Query global defaults: `staleTime 30s`, `gcTime 10m`, `refetchOnWindowFocus: false`, `networkMode: offlineFirst`, retry only on 5xx/408/429 with exponential backoff + jitter (max 15s, 2 retries). Mutations: no auto-retry.
- `ErrorBoundary` auto-recovers from `ChunkLoadError` / dynamic-import failures via one-shot `sessionStorage`-guarded reload, and ships 1% sampled telemetry to `client-telemetry` edge function via `navigator.sendBeacon`.
- `retryHelpers.calculateBackoffDelay` uses full jitter (random in [0, cappedExp]) to avoid thundering herds.

## Edge Functions (Deno)
- Service-role Supabase client must be a module-level singleton — use `_shared/getServiceClient.ts`. Never `createClient` inside the request handler (connection pool churn).
- Read-mostly settings (platform_settings, commission, paybill, maintenance_modules) should be wrapped with `_shared/edgeCache.ts` `cached(key, ttlMs, loader)` — TTL 10–30s, coalesces inflight loads.
- All financial / abuse-prone endpoints (`payment-stk-push`, `b2c-payout`, `admin-sms-broadcast`, `maintenance-reconcile`) must call `checkRateLimit` before DB work.

## Database
- Hot-path composite indexes added (migration `20260620_perf_indexes`): `contributions(chama_id,created_at desc)`, `member_cycle_payments(cycle_id,created_at desc)`, `welfare_contributions(welfare_id,created_at desc)`, `mchango_donations(mchango_id,created_at desc)`, `organization_donations(organization_id,created_at desc)`, `withdrawals(requested_by,status)`, `withdrawals(status,created_at desc)`, `audit_logs(user_id,created_at desc)`, `notifications(user_id,is_read,created_at desc)`.
- Capacity scaling: user upgrades Lovable Cloud instance via Backend → Advanced settings → Upgrade instance.

## Static assets
- `vercel.json` sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` and hashed static files; HTML root remains `must-revalidate`.

## Load test
- `LOAD_TEST.md` documents k6 script and acceptance thresholds: <1% errors, p95 <800ms reads, <2.5s STK init, PgBouncer saturation <80%.
