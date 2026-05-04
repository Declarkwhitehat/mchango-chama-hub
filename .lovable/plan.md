## New Chama Restart Flow

### 1. Schema changes (migration)

**`chama` table — new columns:**
- `restart_window_hours` int default 48 (manager-configurable, max 168 = 7 days)
- `restart_window_ends_at` timestamptz (set when cycle completes)
- `restart_opened_at` timestamptz
- `is_defining_cycle` boolean default false (true for first cycle after restart)

**`profiles` table — new column:**
- `has_payout_default` boolean default false (permanent flag, admin-only clear)
- `payout_default_set_at` timestamptz
- `payout_default_reason` text

**`chama_members` table — new column:**
- `received_payout_this_chama` boolean default false (set when their payout completes; used to identify post-payout defaulters)

**`max_members` cap:** Update default/check to 60 (admins can override via existing `enforce_admin_max_members_update` trigger).

### 2. New cycle-complete behaviour

When a chama's last cycle finishes (existing `chama-cycle-complete` flow):
- Status stays `cycle_complete` BUT all existing members remain in `chama_members` with `status='active'` (no wiping, no rejoin requests required).
- Set `restart_opened_at = now()`, `restart_window_ends_at = now() + restart_window_hours` (default 48h).
- Set `accepting_rejoin_requests = true` so the existing JoinByCode/invite flows accept new applicants up to `max_members` (60 cap).
- SMS all members: "Cycle complete. You're automatically in for the next round. Chama restarts in 48h. New members can join."

### 3. Manager controls (UI: ChamaDetail when status=cycle_complete)

Replace current `CycleCompleteManager` (rejoin-approval focused) with a **Restart Window Panel**:
- Countdown timer to `restart_window_ends_at` (visible to **all** members).
- Manager-only: "Extend window" selector (48h / 72h / 5d / 7d, capped at 168h from `restart_opened_at`).
- Manager-only: "Restart now" button — triggers immediate restart.
- Pending join requests list (existing `chama_join` flow already handles approvals).
- Member roster preview showing existing + newly-approved.

### 4. Restart trigger (auto OR manual)

New edge function **`chama-auto-maintenance`** (replaces deleted `chama-auto-cleanup` + `chama-auto-restart`), runs every 2h via existing cron:

For each chama with `status='cycle_complete'` AND (`restart_window_ends_at <= now()` OR manual trigger):
1. Collect all `approved + active` members (existing + newly-approved joiners). No minimum count check — chama restarts with whoever is in.
2. **Reshuffle by success rate** (see §5).
3. Reset cycle counters, clear old `contribution_cycles` / `member_cycle_payments` / debts / deficits / payout_skips for this chama.
4. Reset per-member `received_payout_this_chama=false`, `missed_payments_count=0`, `total_contributed=0`, balances.
5. Reassign `order_index` per new shuffle order (the `prevent_order_index_change` trigger must be temporarily bypassed using `SECURITY DEFINER` RPC, or we add a "restart context" guard).
6. Set `chama.status='active'`, `start_date=now()`, `current_cycle_round = previous + 1`, `is_defining_cycle=true`, clear restart fields, `accepting_rejoin_requests=false`.
7. SMS each member with new position + payout date.

A second endpoint `chama-restart-now` (or POST mode on `chama-auto-maintenance`) lets the manager trigger restart early.

### 5. Reshuffle ordering algorithm

Pull `member_trust_scores.trust_score` for each user. Sort:

```text
1. has_payout_default = true             → ABSOLUTE LAST (stable order: joined_at)
2. trust_score >= 50, with history       → DESC by score, ties = joined_at ASC
3. trust_score < 50, with history        → after group 2, DESC by score, ties = joined_at
4. New members (no trust_scores row)     → after group 3, ordered by joined_at ASC
5. has_payout_default group              → appended at the very end
```

Manager gets no special treatment — sorted purely by score.

### 6. Defining first cycle (post-restart)

While `is_defining_cycle=true`:
- Daily payment cron treats non-payment as **clean removal**: set `chama_members.status='removed'`, no `missed_payments_count` increment, no `has_payout_default` flag, no debt record.
- After cycle 1 closes: set `is_defining_cycle=false`, recompute payout schedule with surviving members, SMS everyone with the removed list and updated payout dates.

### 7. Post-payout default tracking

When a member's payout (`withdrawals.status='completed'` for a chama beneficiary): set `chama_members.received_payout_this_chama=true`.

In the standard daily payment / 3-strike cron (existing `chama-auto-removal-logic`), branch:
- If `received_payout_this_chama=false` AND missed=3 → existing clean removal.
- If `received_payout_this_chama=true` AND missed=3 (consecutive, post-payout) → **DO NOT remove**. Instead:
  - Set `profiles.has_payout_default=true`, `payout_default_set_at=now()`, `payout_default_reason='Defaulted after payout in chama <name>'`.
  - Freeze the user account: block all chama joins/creates/contributions (gate via RLS + UI check on `has_payout_default`).
  - Keep them in the chama as frozen (cannot pay, cannot withdraw, sits last in any future restart shuffle).

Admin clears the flag from `AdminUserDetail` → new "Clear Payout Default" action (admin-only RPC).

### 8. File changes

**Delete:**
- `supabase/functions/chama-auto-cleanup/` (and call `supabase--delete_edge_functions`)
- `supabase/functions/chama-auto-restart/` (and call `supabase--delete_edge_functions`)

**Create:**
- `supabase/functions/chama-auto-maintenance/index.ts` — combined cron handler + manual restart endpoint
- Migration with schema additions, indexes, and admin RPC `admin_clear_payout_default(user_id)`

**Update:**
- `supabase/functions/chama-cycle-complete/index.ts` — set restart window + keep members instead of triggering rejoin flow
- `supabase/functions/chama-join/index.ts` — allow joins during `cycle_complete` window when `accepting_rejoin_requests=true`, enforce 60 cap
- `src/pages/ChamaDetail.tsx` + `CycleCompleteBanner` + `CycleCompleteManager` — show countdown, extend-window selector (manager), "Restart Now" button (manager); remove rejoin-request approval UI
- `src/pages/AdminUserDetail.tsx` — add "Clear Payout Default" action when flag is set
- Auth/creation gates: `ChamaCreate`, `ChamaJoin`, `WelfareJoin`, payment forms — hard-block if `has_payout_default=true` (with explainer message)

**Cron:** Update existing `chama-auto-maintenance-2hr` job's URL/body to point to the new merged function; schedule unchanged (`0 */2 * * *`).

### 9. Memory updates

Replace `mem://features/chama-cycle-restart-with-reshuffling` and add a new `mem://chama/payout-default-permanent-flag` memory. Update Core if needed.

### Open question
The user said members with `has_payout_default` are "frozen permanently" but also "placed always last in payout order in every future chama". A frozen user can't contribute, so they can't actually participate in a new chama. I'll interpret this as: **frozen = blocked from joining/creating new chamas entirely**, AND if they were already a member when frozen, they remain visible at the bottom of that chama's order but cannot pay or receive payouts. Will confirm in implementation if you want different behaviour.
