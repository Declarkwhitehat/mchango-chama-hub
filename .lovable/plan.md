

## Enhance Admin Payout Approvals with Full Context & Double-Payout Prevention

### Problem
1. Admin lacks sufficient details to make informed approve/reject decisions (no payment history, no payout history, no chama financial summary)
2. Members list doesn't show ALL members — only active/approved ones without payout history
3. No guard against a member receiving a payout twice before all others have received theirs

### Changes

#### 1. Backend: Enrich `get-eligible-members` action (`supabase/functions/payout-approval/index.ts`)

Add to the response for each member:
- **`payouts_received`**: Count of cycles where this member was `beneficiary_member_id`
- **`total_received_amount`**: Sum of completed withdrawals for this member
- **`missed_payments_count`**: Already available, surface it
- **`carry_forward_credit`**: Current credit balance
- **`phone`**: From profiles (already joined but not surfaced to UI)
- **`was_skipped`**: Whether they were previously skipped
- **`trust_score`**: If available

Add a **chama summary** to the response:
- `total_members`, `contribution_amount`, `available_balance`, `total_cycles_completed`, `group_code`
- **`payout_history`**: List of past cycles with beneficiary name and amount — so admin can see who already got paid

Add a **double-payout guard**: For each member, check if they've already received a payout in the current round. A "round" = the set of cycles from cycle 1 to `total_members`. If a member has received in this round, mark `already_received_this_round: true`.

#### 2. Backend: Block double-payout in `approve` action

Before creating the withdrawal, verify the chosen member hasn't already received a payout this round (unless all members have received, indicating a new round). Return error if violated.

#### 3. Frontend: Richer approval dialog (`src/pages/AdminPayoutApprovals.tsx`)

**Request card enhancements:**
- Show chama `group_code`, `contribution_amount`, `available_balance`
- Show cycle date range
- Expand ineligible members list with reasons inline

**Approval dialog enhancements:**
- Add a "Chama Summary" section at top: total members, balance, cycles completed
- Add "Payout History" collapsible: table of past payouts (cycle #, member, amount, date)
- Member table columns: Name, Phone, Position, Payouts Received, Missed Payments, Credit Balance, Debts, Status, Already Received This Round
- Members who `already_received_this_round` shown with a warning badge and disabled for selection
- Sort members: eligible first, then by `order_index`
- Show ineligible reason detail in tooltip or inline

#### 4. Simulation: Add Scenario 13 — Double-Payout Prevention

Test that:
1. Member who received in cycle 1 cannot be admin-selected in cycle 2 (within same round)
2. After all members receive, the guard resets for the next round
3. B2C is triggered on valid approval

### Files

| File | Change |
|------|--------|
| `supabase/functions/payout-approval/index.ts` | Enrich `get-eligible-members` with payout history, chama summary, round tracking. Add double-payout guard to `approve`. |
| `src/pages/AdminPayoutApprovals.tsx` | Richer request cards, expanded approval dialog with payout history, member details, round guard UI |
| `supabase/functions/simulate-chama-test/index.ts` | Add Scenario 13: double-payout prevention E2E test |

