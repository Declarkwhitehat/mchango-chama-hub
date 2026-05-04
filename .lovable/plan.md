## Chama Simulator — 3-turn build

You answered: **real DB writes with `is_test=true`**, **real auth.users with `000xxxxxxxx` phones**, **simulator + Stage 6/9 gates only**, **3 turns**.

This turn presents the plan; once approved I'll execute Turn 1 in build mode.

---

### Turn 1 — Infrastructure

**Migration** (`supabase--migration` tool) — adds `is_test boolean default false` to:
`profiles`, `chama`, `chama_members`, `mchango`, `welfares`, `withdrawals`, `member_trust_scores`, `chama_rejoin_requests`. Plus partial indexes on `(is_test) WHERE is_test=true` for `profiles` and `chama`.

Creates `simulation_runs` table:
```text
id uuid pk, run_by uuid, started_at, finished_at, status text,
total_tests int, passed int, failed int, current_stage text,
report jsonb  -- { stages: [...], summary: {...} }
```
RLS: admin-only ALL.

Creates `admin_purge_simulation_data()` (SECURITY DEFINER, admin-only) that deletes — in FK-safe order — every row tied to `is_test=true` chamas/profiles across:
`member_cycle_payments → contributions → contribution_cycles → chama_member_debts → chama_cycle_deficits → chama_cycle_history → chama_overpayment_wallet → chama_member_removals → chama_messages → chama_invite_codes → chama_rejoin_requests → payout_skips → withdrawals → chama_members → chama`,
then `member_trust_scores → payment_methods → user_roles → notifications → audit_logs → profiles → auth.users`. Also prunes `simulation_runs` older than 30 days.

**Edge function `chama-simulator`** — skeleton with three actions: `start` (creates run, fires stage runner), `status` (returns run row), `reset` (calls purge RPC). Auth: extracts JWT, verifies admin via `user_roles`. `verify_jwt = false` in code (in line with project standard). Stage runner is a stub in this turn.

**Admin page `src/pages/AdminChamaSimulator.tsx`** — UI with:
- Header + description
- **Run Simulation** button (calls edge fn `start`, polls `status` every 2 s)
- **Reset Simulation** button (calls `reset`, confirms first)
- **Download Report (PDF)** button (uses `jspdf` + `jspdf-autotable`, both already installed)
- Live progress: current stage badge + progress bar (stages completed / 10)
- Summary card: total / passed / failed
- Per-stage cards (collapsible) with expected, actual, pass/fail badge
- Final payout-order table from Stage 8
- Recommendations panel for failed stages

**Sidebar** — add a new **Testing** group in `AdminSidebar.tsx` with one item: `Chama Simulator → /admin/chama-simulator` (icon `FlaskConical`).

**App.tsx** — register lazy route `/admin/chama-simulator` behind `AdminProtectedRoute`.

---

### Turn 2 — Stage runners (10 stages)

All stages run server-side in `chama-simulator/index.ts`, append a `StageResult` to `simulation_runs.report.stages` after each stage.

Helper utilities created at top of the file:
- `createTestUser(idx, scoreOrNull, hasPayoutDefault)` — `auth.admin.createUser` with phone `'000' + idx.padStart(7,'0')`, KYC approved, `is_test=true`. Inserts a `member_trust_scores` row if score given.
- `seedTestChama(managerUserId, name, contribAmount=100, frequency='weekly')` — inserts chama row with `is_test=true`, status `'pending'`.
- `joinTestMember(chamaId, userId)` — inserts approved `chama_members` row with `is_test=true` and `joined_at` advanced by 1 minute per member.
- `startChamaWithReshuffle(chamaId)` — re-orders members by success-rate algorithm, sets `start_date=now()`, status `'active'`, creates cycle 1, sets `is_defining_cycle=true`, sets cycle deadline to next-day 22:00 EAT.
- `simulatePayment(memberId, cycleId)` — inserts `contributions` (status completed) + `member_cycle_payments` (is_paid=true).
- `closeCycle(cycleId)` — sets `end_date = now()`, marks unpaid members; on defining cycle sets them to `status='removed'` cleanly; on regular cycles increments `missed_payments_count` and applies the freeze rule when `received_payout_this_chama=true && missed=3`.
- `advanceCycle(chamaId)` — creates next cycle and sets the next beneficiary.

Stage 1 — Member setup & success-rate ordering (10 expected positions checked individually).
Stage 2 — Deadline = next-day 22:00 EAT verification + early-payment idempotency.
Stage 3 — Defining-cycle clean removal of 5 members incl. manager.
Stage 4 — Manager auto-succession to highest-score remaining member.
Stage 5 — Cycles 2–6: payouts + 3-strike freeze on Member 2 after receiving payout, sets `has_payout_default=true`.
Stage 6 — Frozen-member action attempts (insert chama, insert mchango withdrawal, insert welfare, insert chama_members) all rejected by gates added in Turn 3.
Stage 7 — Cycle completion + restart window: extend to 5 days then manual early restart.
Stage 8 — Reshuffle places frozen Member 2 last, new no-history members in middle.
Stage 9 — Fresh chama: frozen Member 2 last; admin clears flag; another fresh chama: ordered normally.
Stage 10 — Fresh chama, immediate payment, deadline integrity, no double-payment.

---

### Turn 3 — Gates (so Stage 6 and 9 actually pass)

**Migration** — DB-level gate on `chama_members` insert: trigger blocks insert when `profiles.has_payout_default=true` (raises `PAYOUT_DEFAULT_FROZEN`). Same trigger on `chama` insert (created_by check) and on `withdrawals` insert (requested_by check).

**Frontend** — In `ChamaCreate.tsx`, `ChamaJoin.tsx`, `WelfareWithdrawalRequest.tsx`, and the Mchango withdrawal flow: pre-fetch `profiles.has_payout_default` for the current user; if true, show a clear blocking dialog with the `payout_default_reason` and an "Appeal to admin" link. No silent failures.

**Admin "Clear payout default"** — already wired via `admin_clear_payout_default` RPC from earlier work.

---

### Files this build will touch

```text
supabase/migrations/<ts>_simulator_infra.sql       (new, turn 1)
supabase/migrations/<ts>_payout_default_gates.sql  (new, turn 3)
supabase/functions/chama-simulator/index.ts        (new, turn 1 + 2)
supabase/config.toml                               (add chama-simulator entry if needed)
src/pages/AdminChamaSimulator.tsx                  (new, turn 1)
src/components/admin/AdminSidebar.tsx              (turn 1: + Testing group)
src/App.tsx                                        (turn 1: + lazy route)
src/pages/ChamaCreate.tsx                          (turn 3)
src/pages/ChamaJoin.tsx                            (turn 3)
src/components/welfare/WelfareWithdrawalRequest.tsx(turn 3)
src/components/MchangoOfflinePayment.tsx OR WithdrawalButton.tsx (turn 3)
```

### Notes / risks

- The `prevent_order_index_change` trigger is already relaxed for `cycle_complete` and `pending` statuses, so Stage 1 reshuffle works.
- Real `auth.users` will be created with phone `000xxxxxxxx`. These are valid E.164 only because Supabase doesn't strictly validate; the `000` prefix guarantees no real SMS goes anywhere because our SMS provider rejects it (and we never invoke `send-transactional-sms` from the simulator).
- All notification triggers (`notify_push_on_notification_insert`) will fire on test data — the push function will silently fail because device_tokens won't exist for these UUIDs. Acceptable.
- The simulator is destructive of test data only; the pre-purge at start guarantees a clean slate.
