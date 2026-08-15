# Merit-Based Payout Order at Chama Start

Replace the pure random shuffle used when a manager clicks "Start Chama" with a track-record ranking, plus a permanent pin for the number 0707874790 at position 1.

## Ranking rules

When the manager starts a chama, approved members are ordered as:

1. **Pinned member** — if a member's phone is +254707874790, they always get position 1.
2. **Tier 1 — proven members**: anyone who has completed all cycles in at least one previous chama (no missed payments, no outstanding debt in that chama). Sorted by trust score, highest first.
3. **Tier 2 — everyone else**: members with no completed-chama history. Randomly shuffled among themselves (Fisher-Yates, as today).

Ties inside a tier are broken by on-time payment count, then randomly.

## What the manager sees

- The pre-start screen currently says order is "based on join date" — it will say order is based on payment track record, with proven members first and new members shuffled fairly.
- Each member row shows a small badge: "Proven" (completed a past chama) or "New" — no scores exposed.
- After start, positions and member codes are assigned exactly as today and remain immutable.

## Technical notes

- Change is in `supabase/functions/chama-start/index.ts`, replacing the Fisher-Yates block (lines ~175-192).
- Track record comes from existing data, no schema change:
  - `member_trust_scores` (trust_score, total_chamas_completed, total_on_time_payments) for ranking.
  - `chama_members` joined to `chama` where `chama.status` is `completed`/`cycle_complete` and the member row has `missed_payments_count = 0` and no debt — this defines Tier 1.
- Pin: resolve the member's `profiles.phone`, normalize to `+254707874790` / `254707874790` / `0707874790`, and force that member to index 1; everyone else shifts down.
- `chama-start-new-cycle` keeps its existing reshuffle behaviour unless you want the same rule applied there too.
- Update copy and badges in `src/components/chama/PreStartDashboard.tsx`.
