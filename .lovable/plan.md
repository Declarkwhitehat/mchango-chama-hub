## Convert 11 Edge Functions → RPC / direct PostgREST / DB trigger

This is a large refactor (~5,075 lines of edge code across 11 functions, plus 5+ frontend files). I want to flag three blockers and confirm scope before I start.

### Blockers / things I cannot do exactly as written

1. `capture-login-ip` **cannot become a trigger on** `auth.users`**.**
  - Project rule (memory: "Avoid Modifying Supabase-Reserved Schemas"): no triggers on `auth.*`.
  - Even if allowed, Postgres triggers do not see the HTTP client IP — that is only available at the API/edge layer. A DB trigger physically cannot record the real client IP.
  - **Proposal:** keep `capture-login-ip` as an Edge Function (it's the only way to capture IP), OR drop it entirely and rely on `last_login_ip` being set elsewhere. Tell me which.
2. `contributions-crud` **(1,320 lines) and** `withdrawals-crud` **(1,536 lines) are mostly write/payment paths**, not reads. Looking at them, the "read paths" are a small fraction. I need to audit each handler to separate read vs. write before porting. A clean conversion of just the reads is realistic; touching the writes is out of scope per your instructions.
  - **Proposal:** I'll inventory each function's actions, port only the pure-SELECT actions to direct `supabase.from(...)` with RLS, and leave every write/payment action as-is. I'll do this audit in the implementation pass and report the exact list before deleting anything.
3. `member-dashboard` **(321 lines) and** `chama-reports` **(797 lines)** do heavy multi-table aggregation in TypeScript. Porting line-by-line to plpgsql while *exactly* preserving the JSON shape is doable but error-prone. I'll mirror the JSON keys 1:1 and add a regression check (call both old + new in parallel for one render and diff) before deleting the edge function. OK?

### What I will do (assuming you confirm above)

**Migration 1 — RPC functions (SECURITY DEFINER, search_path=public):**

- `public.get_member_dashboard(p_member_id uuid, p_chama_id uuid) returns jsonb` — port of `member-dashboard/index.ts`. Auth check: `auth.uid()` must equal the member's `user_id` OR be a chama manager OR have `has_role(auth.uid(),'admin')`.
- `public.get_chama_report(p_chama_id uuid) returns jsonb` — port of `chama-reports/index.ts`. Auth: chama manager or admin.
- `public.admin_search(p_query text, p_type text default null, p_limit int default 50) returns jsonb` — internal admin check `IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION ...`.
- `public.admin_transactions(p_filters jsonb default '{}', p_limit int default 100, p_offset int default 0) returns jsonb` — same admin guard.
- `public.admin_member_activity(p_user_id uuid) returns jsonb` — same admin guard.

**Migration 2 — Reschedule/cleanup (none — these are user-invoked, no cron).**

**Frontend changes:**

- `MemberDashboard.tsx`, `AdminSearch.tsx`, `TransactionsTable.tsx`, `WithdrawalsManagement.tsx`, `PaymentAllocationPreview.tsx`, plus any caller of `payment-methods` / `payment-config`: replace `supabase.functions.invoke('x', …)` with `supabase.rpc('y', …)` or `supabase.from('table').select(…)`.
- `payment-methods` reads → `supabase.from('payment_methods').select('*').eq('user_id', user.id)` (RLS already restricts to owner).
- `payment-config` reads → `supabase.from('payment_config').select('*')` (verify RLS allows public/auth read; if not, leave as edge function).

**Edge function deletions (after frontend cutover + smoke check):**

- `member-dashboard`, `chama-reports`, `admin-search`, `admin-transactions`, `admin-member-activity`, `payment-methods`, `payment-config` — fully delete.
- `contributions-crud`, `transactions-crud`, `withdrawals-crud` — KEEP, only remove the read handlers. (I'll list which.)
- `capture-login-ip` — keep (see blocker #1) unless you tell me to drop it.

### What I need from you before I start

1. Confirm `capture-login-ip` decision: keep as edge function, or drop entirely?
2. Confirm OK to leave write/payment handlers in `contributions-crud` / `withdrawals-crud` / `transactions-crud` untouched, only converting reads?
3. Confirm OK with the regression-check approach for `member-dashboard` and `chama-reports` (i.e., I'll port them, but if any consumer relies on a subtle field shape I may need to iterate)?

Once you answer, I'll do the audit + implementation in one pass.   Question 1 — capture-login-ip

Keep it as an Edge Function. It records real client IPs for your fraud monitoring system which you just enhanced. Losing IP data would weaken your fraud detection. The cost of one Edge Function that only fires on login is negligible compared to the security value.

Question 2 — contributions-crud, withdrawals-crud, transactions-crud

Yes confirm only convert the read paths. Never touch the write and payment paths. Those handle real money and must stay exactly as they are.

Question 3 — Regression check for member-dashboard and chama-reports

Yes confirm the regression check approach. Running old and new in parallel and diffing the output before deleting the old function is exactly the right way to do this safely. This is good engineering practice.

One additional instruction to add

Before approving send Lovable this clarification alongside your answers:

Confirmed on all three points. Keep capture-login-ip as an Edge Function. Only convert read paths in contributions-crud, withdrawals-crud and transactions-crud leaving all write and payment handlers completely untouched. Proceed with the regression check approach for member-dashboard and chama-reports. One additional requirement: do not delete any Edge Function until the frontend has been fully updated to use the new RPC or direct query AND you have confirmed the data returned matches exactly. Delete only after successful smoke check, not before