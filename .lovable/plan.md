
# Chama Cycle Management Rules - Complete Implementation

## Overview

This plan implements the full chama cycle management lifecycle: manager editing terms after cycle completion, member confirmation before rejoining, 48-hour auto-restart, and 24-hour auto-deletion if less than 40% rejoin. It also removes the approval requirement for returning members.

---

## Current State

- Cycle completion sets chama status to `cycle_complete` and enables rejoin requests
- Members must submit rejoin requests, manager must approve/reject each one
- Manager manually starts new cycle via `chama-start-new-cycle`
- No auto-restart or auto-delete logic exists
- No ability to edit contribution amount/frequency between cycles
- All rejoin requests (returning + new) require manager approval

---

## Changes

### 1. Allow Manager to Edit Terms After Cycle Completion

**File: `supabase/functions/chama-crud/index.ts`**

Update the PUT handler to allow managers to edit `contribution_amount` and `contribution_frequency` (and `every_n_days_count`) when the chama status is `cycle_complete`. Currently the generic PUT allows updates but doesn't validate context. Add a whitelist of editable fields during cycle_complete.

**File: `src/components/chama/CycleCompleteManager.tsx`**

Add an "Edit Terms" section at the top of the manager view showing:
- Editable contribution amount input
- Editable contribution frequency dropdown
- Save button that calls PUT `/chama-crud/:id`
- Display current vs updated terms clearly

### 2. Auto-Approve Returning Members, Require Approval Only for New Members

**File: `supabase/functions/chama-rejoin/index.ts`**

In the POST handler (line 43-126), after checking for existing request:
- Check if the user has a `previous_member_id` (was a member before)
- If yes: auto-set status to `approved` instead of `pending`
- If no (new member): keep status as `pending` requiring manager approval
- Send different SMS to manager: "X has re-joined" vs "New member X requests to join"

**File: `src/components/chama/CycleCompleteBanner.tsx`**

Update the UI to reflect auto-approval for returning members:
- After submitting rejoin, show "Approved" badge immediately for returning members
- Show "Pending Approval" only for new members

### 3. Display Updated Terms Before Rejoin Confirmation

**File: `src/components/chama/CycleCompleteBanner.tsx`**

Before the "Request to Rejoin" button, show a card with:
- New contribution amount (KES X)
- New frequency
- Current confirmed members count
- Estimated start date
- A checkbox: "I confirm I agree to these terms"
- Disable rejoin button until checkbox is checked

### 4. Auto-Restart After 48 Hours

**New edge function: `supabase/functions/chama-auto-restart/index.ts`**

A cron-triggered function that:
1. Finds all chamas with status `cycle_complete` where `last_cycle_completed_at` is more than 48 hours ago
2. For each, counts approved rejoin requests
3. If approved count >= `min_members`: auto-start the new cycle (reuse logic from `chama-start-new-cycle`)
4. Send SMS: "Your chama has automatically restarted with X members"

**Database: Add cron job** for `chama-auto-restart` to run every hour.

### 5. Auto-Delete After 24 Hours if Less Than 40% Rejoin

**New edge function: `supabase/functions/chama-auto-cleanup/index.ts`**

A cron-triggered function that:
1. Finds all chamas with status `cycle_complete` where `last_cycle_completed_at` is more than 24 hours ago
2. For each, gets the total member count from `chama_cycle_history` (latest round)
3. Counts total rejoin requests (pending + approved)
4. If rejoin count < 40% of total members:
   - Set chama status to `deleted`
   - Send SMS to all members: "Chama X did not meet minimum 40% participation. The chama has been closed. You can join or create another chama."
   - Delete all pending rejoin requests

**Database: Add cron job** for `chama-auto-cleanup` to run every hour (before auto-restart check).

### 6. Notification on All Updates

All existing and new actions already trigger SMS. Additional notifications needed:
- When manager edits terms: SMS to all members with updated terms
- When auto-restart happens: SMS with new payout position
- When auto-delete happens: SMS informing closure

---

## Technical Details

### Database Changes

1. Add `deleted` to `chama_status` enum (for auto-deletion):
```sql
ALTER TYPE chama_status ADD VALUE IF NOT EXISTS 'deleted';
```

2. Add cron jobs for auto-restart and auto-cleanup functions.

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/chama-auto-restart/index.ts` | Hourly cron: auto-restart chamas 48h after cycle_complete |
| `supabase/functions/chama-auto-cleanup/index.ts` | Hourly cron: auto-delete chamas with <40% rejoin after 24h |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/chama-rejoin/index.ts` | Auto-approve returning members |
| `supabase/functions/chama-crud/index.ts` | Allow editing amount/frequency during cycle_complete |
| `src/components/chama/CycleCompleteManager.tsx` | Add edit terms UI, show auto-approve status |
| `src/components/chama/CycleCompleteBanner.tsx` | Show terms confirmation before rejoin, auto-approval for returning members |

### Edge Function Deployments

- `chama-rejoin`
- `chama-crud`
- `chama-auto-restart`
- `chama-auto-cleanup`

### Execution Order

1. Database migration (add `deleted` enum value)
2. Create `chama-auto-cleanup` edge function
3. Create `chama-auto-restart` edge function
4. Modify `chama-rejoin` for auto-approve returning members
5. Modify `chama-crud` for term editing
6. Update `CycleCompleteManager.tsx` with edit terms UI
7. Update `CycleCompleteBanner.tsx` with terms display and confirmation
8. Set up cron jobs for both auto functions
9. Deploy all edge functions
