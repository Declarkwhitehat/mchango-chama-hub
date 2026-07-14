# Welfare Overpayment Carry-Forward

## Goal
In a welfare group, when the admin opens a new contribution cycle (e.g. KES 80), any member who already overpaid in a previous cycle should automatically show as **100% paid** for the new cycle, until their surplus is used up. Members who paid exactly the required amount stay at 100%. Only genuine shortfalls appear as unpaid/underpaid.

## Current behavior (problem)
`WelfareCycleStatus.tsx` looks only at `welfare_contributions` rows whose `created_at` falls **inside the active cycle's `start_date`–`end_date` window**. A member who overpaid last cycle (surplus sitting in the group) is shown as "unpaid" for the new cycle even though their credit already covers it.

## New rule (cycle-agnostic credit)
For each active member, compute:

```
cumulative_paid    = SUM(gross_amount of that member's completed welfare_contributions
                        across ALL cycles of this welfare, since they joined)
cumulative_required = SUM(cycle.amount for every cycle whose start_date >= member.joined_at
                        AND status IN ('active','completed'))
credit_balance      = cumulative_paid - cumulative_required
```

Status for the current active cycle:
- `credit_balance >= 0` → **Paid (100%)**. If `credit_balance > 0` also show a small "Credit: KES X carried forward" hint.
- `-cycle.amount < credit_balance < 0` → **Underpaid**, remaining = `-credit_balance`.
- `credit_balance <= -cycle.amount` → **Unpaid**, owed = `-credit_balance` (may exceed one cycle if they've missed several).

This makes overpayment automatically satisfy the next cycle(s) without any admin action or DB writes.

## Scope of changes (frontend only)

### `src/components/welfare/WelfareCycleStatus.tsx`
- Replace the current single-cycle contribution fetch with:
  1. Fetch **all** cycles for this welfare (`status in ('active','completed')`, ordered by `start_date`).
  2. Fetch **all completed** `welfare_contributions` for this welfare (member_id, user_id, gross_amount, created_at).
- For each member, compute `cumulative_paid` and `cumulative_required` per the formula above (respecting the member's `joined_at`/`created_at` so new joiners aren't billed for cycles that ran before they joined).
- Recompute `paidMembers`, `underpaidMembers`, `unpaidMembers`, and the current-user banner from `credit_balance` instead of in-window sums.
- In the "All Paid / X unpaid" summary and the collapsibles, show `Credit: KES X` next to members whose `credit_balance > 0`.
- Keep the existing UI shell, deadline countdown, and copy — only the counting logic changes.

### `src/components/welfare/WelfareContributionForm.tsx` (light touch)
- Before submitting, if the member's current `credit_balance` already covers `cycle.amount`, show an inline notice: "You already have KES X credit from previous overpayment — this cycle is covered. You can still contribute extra if you want."
- Do not block the payment; just inform. No backend change.

## Non-goals
- No DB migration, no changes to `welfare_contributions`, no edits to balances, no changes to commission or withdrawal logic.
- No changes to chama/mchango — welfare only, as requested.
- Historical rows and admin-facing totals are untouched.

## Technical notes
- All logic runs client-side from existing tables (`welfare_contribution_cycles`, `welfare_contributions`, `welfare_members`); no new RPC needed.
- `gross_amount` is the source of truth for "what the member paid" (matches the existing file's comment).
- Member join date: use `welfare_members.created_at` (or `joined_at` if present) to avoid billing new members for old cycles.
