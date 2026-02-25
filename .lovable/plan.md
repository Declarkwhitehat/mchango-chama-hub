

# Online Welfare System - Full Build Plan

## Overview

Build a complete Online Welfare System as a new entity type alongside Chama, Mchango, and Organizations. The welfare system features a 3-person executive panel (Chairman, Secretary, Treasurer) with multi-signature withdrawal approval, isolated wallets, flexible contributions set by the Secretary, and comprehensive accountability features.

## Database Schema

### New Tables

**1. `welfares`** - Core welfare entity (similar to `chama` / `mchango`)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| created_by | uuid | Auto becomes Chairman |
| name | text | |
| slug | text | Unique |
| description | text | |
| group_code | text | Auto-generated 4-char |
| paybill_account_id | text | For C2B payments |
| contribution_amount | numeric | Set by Secretary |
| contribution_frequency | text | monthly/weekly/custom |
| contribution_deadline_days | integer | Days to pay after cycle starts |
| min_contribution_period_months | integer | Default 3 - months before withdrawal eligibility |
| commission_rate | numeric | Default 0.05 (5%) |
| total_gross_collected | numeric | Default 0 |
| total_commission_paid | numeric | Default 0 |
| available_balance | numeric | Default 0 |
| current_amount | numeric | Default 0 |
| total_withdrawn | numeric | Default 0 |
| is_public | boolean | Default true |
| is_frozen | boolean | Default false |
| frozen_at | timestamptz | |
| frozen_reason | text | |
| whatsapp_link | text | |
| status | text | active/inactive |
| created_at / updated_at | timestamptz | |

**2. `welfare_members`** - Member roster with roles

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| welfare_id | uuid FK | |
| user_id | uuid | |
| role | text | chairman/secretary/treasurer/member |
| member_code | text | WelfareCode + random suffix |
| status | text | active/inactive/removed |
| joined_at | timestamptz | |
| total_contributed | numeric | Default 0 |
| is_eligible_for_withdrawal | boolean | Default false (computed based on min period) |
| created_at | timestamptz | |

**3. `welfare_contributions`** - Payment records

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| welfare_id | uuid FK | |
| member_id | uuid FK → welfare_members | |
| user_id | uuid | |
| gross_amount | numeric | |
| commission_amount | numeric | |
| net_amount | numeric | |
| payment_reference | text | |
| payment_method | text | |
| payment_status | text | pending/completed/failed |
| mpesa_receipt_number | text | |
| cycle_month | text | e.g. "2026-02" for tracking |
| created_at / completed_at | timestamptz | |

**4. `welfare_withdrawal_approvals`** - Multi-sig approval tracking

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| withdrawal_id | uuid FK → withdrawals | |
| welfare_id | uuid FK | |
| approver_id | uuid FK → welfare_members | |
| approver_role | text | secretary/treasurer |
| decision | text | pending/approved/rejected |
| decided_at | timestamptz | |
| rejection_reason | text | |
| created_at | timestamptz | |

**5. `welfare_contribution_cycles`** - Secretary-defined contribution periods

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| welfare_id | uuid FK | |
| set_by | uuid | Secretary's user_id |
| amount | numeric | Amount for this cycle |
| start_date | date | |
| end_date | date | |
| status | text | active/completed |
| created_at | timestamptz | |

The existing `withdrawals` table will be extended with a `welfare_id` column.

### Withdrawal Flow (Multi-Sig)

```text
Chairman/Treasurer creates withdrawal request
        ↓
   withdrawals.status = 'pending_approval'
   welfare_withdrawal_approvals rows created for Secretary + Treasurer
        ↓
   Secretary gets notification → Approve/Reject
   Treasurer gets notification → Approve/Reject
        ↓
   Both approved? → status = 'approved' → B2C payout
   Any rejected? → status = 'rejected'
```

Key security rules:
- Chairman CANNOT approve their own withdrawal request (visible but not auto-approved)
- Leaders cannot withdraw to themselves (recipient phone != requester's phone)
- Audit logs are immutable (no delete policy for anyone)
- Auto-freeze if Treasurer role changes (requires admin unfreeze)

### RLS Policies

- Members can view their welfare and contributions
- Only Secretary can create/update contribution cycles
- Only Chairman/Treasurer can initiate withdrawals
- Approvals can only be made by the assigned approver
- Admin can view/manage everything
- Audit logs: insert-only, no update/delete for anyone

## Edge Functions

**1. `welfare-crud/index.ts`** - CRUD for welfares
- POST: Create welfare (auto-assign creator as Chairman)
- GET: List/detail
- PUT: Update (Chairman only)
- DELETE: Soft delete (Chairman only)

**2. `welfare-members/index.ts`** - Member management
- POST: Join by code / invite
- PUT: Assign roles (Chairman assigns Secretary & Treasurer)
- DELETE: Remove member

**3. `welfare-contributions/index.ts`** - Contribution handling
- POST: Record contribution (with 5% commission deduction)
- GET: List contributions with filters

**4. `welfare-withdrawal-approve/index.ts`** - Multi-sig approval
- POST: Submit approval/rejection by Secretary or Treasurer
- Auto-triggers B2C payout when both approve
- Auto-rejects if either rejects

**5. Updates to `withdrawals-crud/index.ts`**
- Add `welfare_id` support
- When welfare withdrawal: create approval records, notify Secretary + Treasurer
- Block self-withdrawal (recipient != requester)
- Check min contribution period eligibility

**6. Updates to `b2c-callback/index.ts`**
- Add welfare balance deduction on successful payout

**7. `welfare-cycles/index.ts`** - Contribution cycle management
- POST: Secretary sets amount and duration
- GET: List cycles

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| WelfareCreate | /welfare/create | Create new welfare group |
| WelfareList | /welfare | List user's welfares |
| WelfareDetail | /welfare/:id | Dashboard with balance, contributions, withdrawals, members |
| WelfareJoin | /welfare/join/:slug | Join by invite/code |

### Key UI Components

- **WelfareExecutivePanel** - Shows Chairman, Secretary, Treasurer with role badges
- **WelfareWithdrawalRequest** - Form for Chairman/Treasurer to request withdrawal (recipient phone, amount, reason category)
- **WelfareApprovalCard** - For Secretary/Treasurer to approve/reject with reason
- **WelfareContributionForm** - Pay via STK Push or offline (Paybill + welfare ID)
- **WelfareMemberDashboard** - Total balance, all contributions, all withdrawals, who approved, member payment success rates, missed payments
- **WelfareContributionCycleManager** - Secretary sets amount and duration
- **WelfareTransactionLog** - Full audit trail (who requested, who approved, timestamps, M-Pesa codes)
- **WelfareWithdrawalHistory** - Shows all withdrawals with approval chain

### Navigation Updates

- Add "Welfare" to main navigation alongside Chama, Mchango, Organizations
- Add welfare routes to App.tsx
- Add admin welfare management pages

## Security Features

1. **Min contribution period**: Members must contribute for N months (default 3) before being eligible to receive money
2. **No self-withdrawal**: Leaders cannot withdraw to their own phone number
3. **Immutable audit log**: No delete/update RLS on welfare audit entries
4. **Auto-freeze on Treasurer change**: When Treasurer role is reassigned, welfare freezes automatically; only platform admin can unfreeze
5. **Chairman visibility**: All chairman-initiated requests are visible to all executives, never silently auto-approved
6. **Commission**: 5% on all contributions, credited to company_earnings

## Files to Create/Modify

### New Files (~20)
- `supabase/functions/welfare-crud/index.ts`
- `supabase/functions/welfare-members/index.ts`
- `supabase/functions/welfare-contributions/index.ts`
- `supabase/functions/welfare-withdrawal-approve/index.ts`
- `supabase/functions/welfare-cycles/index.ts`
- `src/pages/WelfareCreate.tsx`
- `src/pages/WelfareList.tsx`
- `src/pages/WelfareDetail.tsx`
- `src/pages/WelfareJoin.tsx`
- `src/components/welfare/WelfareExecutivePanel.tsx`
- `src/components/welfare/WelfareWithdrawalRequest.tsx`
- `src/components/welfare/WelfareApprovalCard.tsx`
- `src/components/welfare/WelfareContributionForm.tsx`
- `src/components/welfare/WelfareMemberDashboard.tsx`
- `src/components/welfare/WelfareContributionCycleManager.tsx`
- `src/components/welfare/WelfareTransactionLog.tsx`
- `src/components/welfare/WelfareWithdrawalHistory.tsx`
- `src/components/welfare/WelfareJoinByCode.tsx`

### Modified Files
- `src/App.tsx` - Add welfare routes
- `src/components/Header.tsx` / navigation - Add Welfare link
- `src/pages/Home.tsx` - Add welfare section
- `supabase/functions/withdrawals-crud/index.ts` - Add welfare_id support + multi-sig logic
- `supabase/functions/b2c-callback/index.ts` - Add welfare balance deduction
- `supabase/functions/_shared/commissionRates.ts` - Add WELFARE: 0.05
- `supabase/config.toml` - Add new edge function entries
- Database migration for all new tables + welfare_id column on withdrawals

### Implementation Order
1. Database migration (all tables + RLS + functions)
2. Edge functions (welfare-crud, welfare-members, welfare-contributions, welfare-cycles, welfare-withdrawal-approve)
3. Update existing edge functions (withdrawals-crud, b2c-callback, commissionRates)
4. Frontend pages (Create, List, Detail, Join)
5. Frontend components (all welfare/* components)
6. Navigation and routing updates

Due to the size, this will be implemented across multiple messages. The first message will focus on the database migration and core edge functions.

