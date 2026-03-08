

## Chama System Upgrade: Fairness, Chat, and Trust Scores

This is a large, multi-feature upgrade. Here is the implementation plan broken into 5 deliverables.

---

### 1. Strengthen Payout Eligibility (All-Cycle Debt Check)

**Current state**: `checkMemberEligibility` in `daily-payout-cron` already checks all `member_cycle_payments` (not just current) and checks `chama_member_debts` for outstanding/partial debts. This is already correct.

**Enhancement needed**: The debt check currently only queries debts in that specific chama. We should also verify `missed_payments_count` is factored in and add an explicit audit log entry stating **why** a member was deemed ineligible (which debts, which cycles).

**Files**: `supabase/functions/daily-payout-cron/index.ts` — minor enhancement to eligibility logging, no logic change needed since it already checks all cycles + debts.

---

### 2. Randomized Payout Order at Chama Start

**Current state**: `chama-start` sorts members by `joined_at` and assigns sequential `order_index`. The `chama-auto-restart` already uses `shuffleArray` for random order.

**Change**: Replace join-date sorting with cryptographically secure Fisher-Yates shuffle in `chama-start`. The manager (creator) does NOT get a guaranteed position — fully random for fairness. Once assigned, `order_index` remains immutable (existing trigger enforces this).

**Files**:
- `supabase/functions/chama-start/index.ts` — replace `sortedMembers` sort-by-join-date with shuffle
- SMS notifications already show the assigned position, so no UI change needed

---

### 3. Batch Invite Code Generation (up to 30)

**Current state**: `chama-invite` generates one code at a time. Frontend calls it once per click.

**Change**:
- Add `batch_generate` action to `chama-invite` edge function accepting `{ count: 1-30 }`, generating multiple codes in a single insert
- Update `ChamaInviteManager.tsx` to add a "Generate Batch" button with a count selector (1-30)
- Maintain all existing validation (manager check, one-time use, expiration support)

**Files**:
- `supabase/functions/chama-invite/index.ts` — add `batch_generate` action
- `src/components/ChamaInviteManager.tsx` — add batch UI with count input

---

### 4. In-App Chama Group Chat

**New feature**: Private messaging scoped to each Chama group.

**Database**:
- New table `chama_messages`: `id`, `chama_id`, `user_id`, `message`, `is_announcement` (manager-only flag), `created_at`
- RLS: Only active approved chama members can SELECT/INSERT. Only managers can set `is_announcement = true`.
- Enable realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.chama_messages;`

**Frontend**:
- New component `src/components/chama/ChamaChatPanel.tsx` — message list with realtime subscription, input box, announcement badge for manager messages
- Integrate as a new "Chat" tab in `ChamaDetail.tsx` (only visible to approved members)

**Files**:
- DB migration: create `chama_messages` table with RLS policies
- `src/components/chama/ChamaChatPanel.tsx` — new component
- `src/pages/ChamaDetail.tsx` — add Chat tab

---

### 5. Member Trust Score / Reputation System

**New feature**: Track member reliability across all Chamas.

**Database**:
- New table `member_trust_scores`: `id`, `user_id` (unique), `total_chamas_completed`, `total_on_time_payments`, `total_late_payments`, `total_missed_payments`, `total_outstanding_debts`, `trust_score` (0-100 integer), `updated_at`
- RLS: Authenticated users can SELECT any trust score (public visibility). Only service role can INSERT/UPDATE.
- A backend function (edge function) will recompute scores.

**Score Formula**:
```
score = min(100, max(0,
  (on_time_payments / total_payments * 70) +
  (completed_chamas * 5, capped at 20) +
  (missed == 0 && debts == 0 ? 10 : 0)
))
```

**Edge Function**: `compute-trust-scores` — runs on schedule or triggered after payout processing. Queries `chama_members`, `member_cycle_payments`, `chama_member_debts` across all chamas for each user and upserts the score.

**Frontend**:
- Show trust score badge in `ChamaPendingRequests.tsx` (manager sees score when reviewing join requests)
- Show trust score on member cards in `ChamaDetail.tsx` members tab
- New component `src/components/chama/TrustScoreBadge.tsx`

**Files**:
- DB migration: create `member_trust_scores` table
- `supabase/functions/compute-trust-scores/index.ts` — new edge function
- `src/components/chama/TrustScoreBadge.tsx` — new component
- `src/components/ChamaPendingRequests.tsx` — show trust score
- `src/pages/ChamaDetail.tsx` — show trust score on member cards
- `supabase/config.toml` — register new functions

---

### Files Summary

| Action | File |
|--------|------|
| Edit | `supabase/functions/chama-start/index.ts` — randomize order |
| Edit | `supabase/functions/daily-payout-cron/index.ts` — enhanced eligibility logging |
| Edit | `supabase/functions/chama-invite/index.ts` — batch_generate action |
| Edit | `src/components/ChamaInviteManager.tsx` — batch UI |
| Create | `src/components/chama/ChamaChatPanel.tsx` — group chat |
| Create | `src/components/chama/TrustScoreBadge.tsx` — trust badge |
| Create | `supabase/functions/compute-trust-scores/index.ts` — trust computation |
| Edit | `src/pages/ChamaDetail.tsx` — add Chat tab + trust scores |
| Edit | `src/components/ChamaPendingRequests.tsx` — show trust score |
| Edit | `supabase/config.toml` — register new functions |
| Migration | Create `chama_messages` table with RLS + realtime |
| Migration | Create `member_trust_scores` table with RLS |

### Safety Guarantees
- No changes to `contributions-crud` settlement engine
- No changes to debt/deficit accrual logic
- `order_index` immutability trigger remains in place
- Idempotency keys and `claim_cycle_for_processing` RPC untouched
- Existing `chama-auto-restart` shuffle logic preserved (already random)
- All new tables have proper RLS policies

