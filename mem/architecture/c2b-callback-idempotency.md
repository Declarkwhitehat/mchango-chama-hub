---
name: C2B Callback Idempotency
description: Every c2b-confirm-payment callback is atomically claimed by M-Pesa receipt so duplicates never re-run side effects.
type: feature
---
`c2b-confirm-payment` wraps all business logic in an idempotency layer:

- Table `public.c2b_callback_claims` (receipt PK, status, result jsonb, created_at, completed_at), service-role only.
- RPC `public.claim_c2b_callback(p_receipt)` returns `'claimed'` or `'duplicate'` atomically (INSERT ... ON CONFLICT DO NOTHING). A `processing` claim older than 10 minutes is treated as stale and re-claimable (crashed run).
- First caller processes; the JSON response is cached on the claim row and replayed verbatim to every later duplicate — no memberships, registration-fee clearing, balance credits, SMS or notifications re-run.
- Non-2xx responses or thrown errors delete the claim so legitimate retries still work.
- Do NOT claim in `mpesa_receipt_registry` — the `enforce_unique_mpesa_receipt` trigger raises on any pre-existing row there.
- Second safety net: welfare auto-enroll insert failures re-read the existing `welfare_members` row instead of creating a duplicate.
