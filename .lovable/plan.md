

## Welfare Executive Change Security System

The backend logic (`welfare-members/index.ts`) and the `welfare_executive_changes` table already exist from the previous edit. What remains is:
1. **Enforcing the withdrawal block** in the withdrawal creation and approval flows
2. **Building the red banner + countdown timer** on the Welfare Detail page
3. **Building the Admin management page** for executive changes
4. **Auto-accept logic** when cooldown expires with no admin action

---

### 1. Enforce Withdrawal Block (Backend)

**`supabase/functions/withdrawals-crud/index.ts`** (POST handler):
- Before creating a welfare withdrawal, query `welfare_executive_changes` for any active cooldown (`cooldown_ends_at > now()` AND `admin_decision = 'pending'`).
- If found, reject with error: "Withdrawals blocked due to executive change. Try again after [cooldown_ends_at]."

**`supabase/functions/welfare-withdrawal-approve/index.ts`**:
- Same check before allowing Secretary/Treasurer approval decisions.

### 2. Red Banner + Timer on Welfare Detail Page

**`src/components/welfare/WelfareExecutiveChangeBanner.tsx`** (new component):
- Queries `welfare_executive_changes` for the welfare where `admin_decision = 'pending'` and `cooldown_ends_at > now()`.
- Displays a red/destructive alert banner showing:
  - "Executive members have changed" with details of outgoing/incoming members
  - Live countdown timer to cooldown expiry
  - Number of cancelled withdrawals
  - "Contact customer care if suspicious" message
- Renders at the top of the welfare detail page.

**`src/pages/WelfareDetail.tsx`**:
- Import and render `WelfareExecutiveChangeBanner` above the main content.

**`src/components/welfare/WelfareWithdrawalRequest.tsx`**:
- Check for active cooldown before showing the form; if blocked, show a disabled state with the timer.

### 3. Admin Executive Changes Management Page

**`src/pages/AdminWelfareExecutiveChanges.tsx`** (new page):
- Table of all `welfare_executive_changes` records with filters (pending, approved, rejected, frozen, auto_accepted).
- Each row shows: welfare name, change details (old/new role + names), cooldown timer, cancelled withdrawals count, admin decision.
- Action buttons per row:
  - **Approve**: Sets `admin_decision = 'approved'`, clears cooldown early
  - **Reject**: Sets `admin_decision = 'rejected'`, keeps welfare frozen, reversal actions
  - **Freeze**: Sets `admin_decision = 'frozen'`, freezes the entire welfare group (`is_frozen = true`)
- If admin does nothing and cooldown expires, the system auto-accepts (handled by a cron or client-side check).

**Route and sidebar integration**:
- Add route `/admin/welfare-executive-changes` in `App.tsx`
- Add sidebar entry under Security section in `AdminSidebar.tsx` with pending badge count

### 4. Auto-Accept After Cooldown Expiry

**`supabase/functions/welfare-executive-auto-accept/index.ts`** (new edge function):
- Called by the daily cron or on-demand.
- Finds all `welfare_executive_changes` where `admin_decision = 'pending'` AND `cooldown_ends_at <= now()`.
- Updates them to `admin_decision = 'auto_accepted'`, `admin_decided_at = now()`.
- Sends notification to welfare members: "Executive change has been accepted. Withdrawals are now unblocked."

Alternatively, the auto-accept check can be done inline in the withdrawal creation flow: if cooldown has expired and decision is still pending, auto-update to `auto_accepted` and allow the withdrawal.

### 5. Admin Dashboard Integration

**`src/pages/AdminDashboard.tsx`**:
- Add a pending executive changes count to the "Action Required" banner.
- Link to the new admin page.

---

### Files to create:
- `src/components/welfare/WelfareExecutiveChangeBanner.tsx`
- `src/pages/AdminWelfareExecutiveChanges.tsx`

### Files to modify:
- `supabase/functions/withdrawals-crud/index.ts` — add cooldown check for welfare withdrawals
- `supabase/functions/welfare-withdrawal-approve/index.ts` — add cooldown check
- `src/pages/WelfareDetail.tsx` — add banner component
- `src/components/welfare/WelfareWithdrawalRequest.tsx` — disable during cooldown
- `src/App.tsx` — add admin route
- `src/components/admin/AdminSidebar.tsx` — add sidebar link with badge
- `src/pages/AdminDashboard.tsx` — add pending count to alerts

### No new migrations needed
The `welfare_executive_changes` table already exists from the previous edit.

