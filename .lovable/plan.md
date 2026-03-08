

## Make Admin Withdrawals 100% Functional

### Problems Found

After studying the code, here are the gaps preventing full functionality:

1. **`pending_approval` status not handled in UI**: Welfare withdrawals use `pending_approval` status (multi-sig approval from secretary + treasurer), but the `getStatusBadge` function doesn't render it and the "Review" button filter doesn't include it — so welfare withdrawal requests are invisible to admins.

2. **No entity name shown**: The table shows "Chama/Welfare/Org" type but not **which** chama or welfare. Admin has no way to identify the source entity.

3. **Manual completion only updates Chama balances**: When "Mark as Paid" is used, only `chama.total_withdrawn` is updated. Mchango, Organization, and Welfare `total_withdrawn`/`available_balance` are never decremented — causing balance drift.

4. **No Retry button for failed/pending_retry withdrawals**: Admin can review them but has no action to retry the B2C payout.

5. **No filter/tab for different statuses**: All withdrawals are shown in one flat list with no ability to filter by status (pending, processing, completed, failed).

6. **Welfare approval status not visible**: For `pending_approval` withdrawals, admin should see which executives have approved/rejected and be able to override.

7. **GET query doesn't join entity names**: The edge function fetches withdrawal data but doesn't include the chama name, welfare name, mchango title, or org name.

### Plan

#### 1. Update `withdrawals-crud` Edge Function (GET handler)

- Join entity names in the GET query: fetch `chama(name)`, `mchango(title)`, `organizations(name)`, `welfares(name)` alongside each withdrawal
- For welfare `pending_approval` withdrawals, also fetch `welfare_withdrawal_approvals` to show approval progress
- Return entity names as part of each withdrawal object

#### 2. Update `withdrawals-crud` Edge Function (PATCH handler)

- **Add retry action**: When admin sends `{ action: 'retry', withdrawal_id }` for `failed`/`pending_retry` withdrawals, re-trigger B2C payout
- **Fix manual completion for all entity types**: When `isManualCompletion`, update `total_withdrawn` and `available_balance` for mchango, organizations, and welfares too (not just chama)
- **Add admin override for welfare `pending_approval`**: Allow admin to force-approve welfare withdrawals, bypassing the multi-sig requirement

#### 3. Redesign `WithdrawalsManagement.tsx`

- **Add status filter tabs**: Pending | Processing | Completed | Failed/Rejected — with counts
- **Add `pending_approval` badge** with tooltip showing secretary/treasurer approval status
- **Add entity name column** in the table (e.g., "Welfare: Maisha Fund")
- **Add Retry M-Pesa button** for failed/pending_retry withdrawals in the review dialog
- **Add phone number display** in review dialog showing recipient's M-Pesa number prominently
- **Show welfare approval progress** (Secretary: Approved ✓, Treasurer: Pending ⏳) for welfare withdrawals
- **Include `failed` status** in reviewable statuses so admin can retry
- **Professional styling**: Clean card layout, proper spacing, status counts in header

#### Files to Edit

1. **Edit** `supabase/functions/withdrawals-crud/index.ts` — GET joins entity names + approvals; PATCH adds retry action + fixes all entity balance updates
2. **Rewrite** `src/components/admin/WithdrawalsManagement.tsx` — Professional redesign with filters, retry, entity names, welfare approval status

