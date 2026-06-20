# Load Testing Guide — Target: 100k RPM (~1,667 RPS)

This document describes how to load-test the platform and the acceptance criteria for "won't crash under traffic."

## Tools

- **k6** (recommended): `brew install k6` or see https://k6.io/
- Alternatively `autocannon` for quick HTTP checks: `npm i -g autocannon`

## Target endpoints

| Endpoint | Type | Notes |
| -- | -- | -- |
| `GET /` | Static HTML | Should be CDN-cached by Vercel |
| `GET /assets/*` | Static asset | `immutable, max-age=1y` (see `vercel.json`) |
| `POST /functions/v1/login` | Edge fn | Rate-limited per identifier |
| `POST /functions/v1/payment-stk-push` | Edge fn | Must be authenticated; throttle test users |
| `GET PostgREST /chamas?select=...` | DB read | Use anon key + RLS |

## k6 script (`load/read-burst.js`)

```js
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 200 },   // ramp
    { duration: '5m', target: 1700 },  // sustain ~100k RPM
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],        // <1% errors
    http_req_duration: ['p(95)<800'],      // p95 <800ms
  },
};

const BASE = __ENV.BASE_URL || 'https://pamojanova.com';

export default function () {
  const res = http.get(`${BASE}/`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```

Run with: `k6 run -e BASE_URL=https://pamojanova.com load/read-burst.js`

## Acceptance criteria

- Zero unhandled client exceptions (check `client-telemetry` edge logs).
- `<1%` 5xx responses overall.
- p95 latency `<800ms` on read endpoints, `<2.5s` on STK init.
- PgBouncer connection saturation `<80%` (check `supabase--db_health`).
- No PostgREST 502s from worker exhaustion.

## What to do when a threshold fails

| Symptom | Action |
| -- | -- |
| High DB CPU | Add index (see `supabase/migrations/20260620_perf_indexes.sql`), or upgrade Lovable Cloud instance |
| Connection saturation | Audit Edge Functions for `createClient` in handler — replace with `getServiceClient()` |
| Many 429s | Tune `rate_limit_attempts` window/limits per endpoint |
| Chunk-load errors after deploy | ErrorBoundary auto-reloads once; if still failing, verify Vercel hashed-asset caching |
| Slow JS bundle | Inspect `dist/assets/*.js` sizes; verify route-level lazy loads |

## Out of scope

- Safaricom Daraja STK has its own per-shortcode quota; we cannot exceed it.
- Native Android OS may kill background processes under memory pressure — unrelated to RPS.
