
# Fix: Immediate Member Removal, Manager Reassignment, and Clean Cycle Restart

## Problems Identified

1. **Manager removal not handled**: When a manager is auto-removed after 3 missed payments, no new manager is assigned. The chama becomes unmanageable.
2. **No member resequencing after removal**: When a member is removed mid-cycle, remaining members' order indices and payout schedule are not updated.
3. **Cycle completion check uses stale member count**: The rotation completion check at line 801 counts only `active` members, but after removals mid-cycle the count changes, potentially breaking the rotation logic.
4. **New cycle doesn't start fresh**: When `chama-start-new-cycle` runs, it carries over the old `current_cycle_round` and financial totals instead of resetting to a brand-new state.

## Plan

### 1. Add Manager Auto-Reassignment After Removal (daily-payout-cron)

After removing a member at 3 missed payments (line 693-733), add logic:
- Check if the removed member `is_manager`
- If yes, find the next active member with `missed_payments_count = 0` and `balance_deficit = 0`, ordered by `order_index`
- Promote them to manager (`is_manager = true`)
- Send SMS notification to the new manager
- Notify all remaining members about the manager change

### 2. Resequence Remaining Members After Removal (daily-payout-cron)

After all removals in a cycle are processed:
- Call the existing `resequence_member_order` database function to update `order_index` values for remaining active members
- Recalculate expected contributions via `calculate_expected_contributions`
- This ensures payout order stays contiguous (no gaps like 1, 2, 5)

### 3. Reset Chama to Brand New on New Cycle Start (chama-start-new-cycle)

Update the `chama-start-new-cycle` edge function to reset all financial and cycle data:
- Set `current_cycle_round` to `1` (not increment)
- Reset `total_gross_collected`, `total_commission_paid`, `available_balance`, `total_withdrawn` to `0`
- Reset `start_date` to current date
- Delete all old `contribution_cycles` for this chama
- Delete all old `member_cycle_payments` for this chama
- Delete all old `chama_member_debts` for this chama
- Delete all old `payout_skips` for this chama
- Archive (not delete) old `chama_members` records (already done)
- New members start with clean records: `missed_payments_count = 0`, `balance_deficit = 0`, `balance_credit = 0`

### 4. Fix Manager Check in chama-start-new-cycle

The current manager verification (line 72-78) checks for `status = 'active'`, but after cycle completion, the manager's status is `removed`. Update to include `removed` status (similar to the fix already done in `chama-rejoin`).

---

## Technical Details

### Files to Modify

**`supabase/functions/daily-payout-cron/index.ts`** (lines 693-733):
- After the removal block, check if `member.is_manager === true`
- If so, query for best replacement manager and promote them
- Add resequencing call after all removals in the loop

**`supabase/functions/chama-start-new-cycle/index.ts`**:
- Line 72-78: Change `.eq('status', 'active')` to `.in('status', ['active', 'removed'])`
- Lines 174-183: Reset all financial fields to 0, set `current_cycle_round` to 1, set `start_date` to now
- Add cleanup queries to delete old cycles, payments, debts, and skips before creating new members

### Deployment
Both edge functions will be redeployed after changes.
