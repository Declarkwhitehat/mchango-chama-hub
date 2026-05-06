## Convert 5 Edge Functions to pg_cron-only DB Functions

Move five scheduled jobs from Edge Functions to pure database functions invoked directly by `pg_cron` (no `net.http_post`, no Edge Function hop).

### Two notes about the request (preserving current behavior)

1. **Trust scores** — the current Edge Function writes to `member_trust_scores`, not `profiles.trust_score` (no such column exists on `profiles`). I'll keep writing to `member_trust_scores` to preserve current behavior, as you instructed.
2. **Financial reconciliation** — the current Edge Function writes anomalies to `reconciliation_logs` (and auto-corrects `chama.available_balance` for small drifts). It does not write to `financial_ledger` or `settlement_locks`. I'll preserve that behavior — anomalies go to `reconciliation_logs`, balance auto-corrects on `chama` — since you said "do not change what these jobs do."

If you actually want different write targets, tell me and I'll adjust before implementing.

### Migration 1 — Create / replace 3 new SECURITY DEFINER functions

(`cleanup_old_chat_messages` and `cleanup_expired_documents` already exist.)

- `public.cleanup_failed_transactions()` — deletes rows older than 12h from `contributions` (status FAILED), `mchango_donations` (failed), `withdrawals` (failed), `transactions` (failed). Same scope as current Edge Function.
- `public.compute_trust_scores()` — set-based SQL port of the Edge Function: aggregates from `chama_members`, `member_cycle_payments`, `chama_member_debts`, `chama_cycle_history`; upserts into `member_trust_scores` with the same scoring formula (70% on-time ratio + 5/completed chama capped at 20 + 10 bonus for clean record; neutral 50 if no payments).
- `public.financial_reconciliation()` — ports the four checks (duplicate mpesa receipts, duplicate payment_reference, chama balance drift with auto-correct < KES 100, excessive contributions > 3× expected) and inserts findings into `reconciliation_logs`.

All three: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.

### Migration 2 — Reschedule cron jobs

Unschedule by name, then re-add via `cron.schedule(name, schedule, $$ SELECT public.fn(); $$)`:

| Job name | Schedule | Calls |
|---|---|---|
| `cleanup-old-chat-messages-weekly` | `0 3 * * 0` | `public.cleanup_old_chat_messages()` |
| `cleanup-expired-documents-weekly` | `0 2 * * 0` | `public.cleanup_expired_documents()` |
| `cleanup-failed-transactions-weekly` | `0 23 * * 0` | `public.cleanup_failed_transactions()` |
| `compute-trust-scores-daily` | `0 3 * * *` | `public.compute_trust_scores()` |
| `financial-reconciliation-daily` | `0 1 * * *` | `public.financial_reconciliation()` |

(Existing `financial-reconciliation` cron, if any with a different name, will also be unscheduled.)

### Step 3 — Delete Edge Functions

Remove these directories and call `supabase--delete_edge_functions` for:
- `cleanup-old-chat-messages`
- `cleanup-expired-documents`
- `cleanup-failed-transactions`
- `compute-trust-scores`
- `financial-reconciliation`

### Out of scope

- No change to `process-document-deletions` (does Storage cleanup — must stay an Edge Function).
- No frontend changes; no other cron jobs touched.