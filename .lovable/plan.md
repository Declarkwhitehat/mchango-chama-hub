
# 24-Hour Welfare Withdrawal Cooling-Off Period

## Overview
After both Secretary and Treasurer approve a withdrawal, a 24-hour countdown begins. During this period, all welfare members can see the withdrawal details. Admin/customer care can cancel it. After 24 hours, B2C payout is automatically triggered.

## Changes

### Step 1: Database Migration
- Add `cooling_off_until` (timestamptz) column to `withdrawals` table
- Add new withdrawal status value: use existing `approved` status but with `cooling_off_until` set
- After cooling period, status changes to `processing` when B2C is triggered

### Step 2: Update welfare-withdrawal-approve Edge Function
- After both approvers agree, instead of immediately calling B2C:
  - Set `cooling_off_until = now() + 24 hours`
  - Keep status as `approved`
  - Create a notification visible to all welfare members

### Step 3: Create welfare-cooling-off-payout Cron Edge Function
- Runs every 15 minutes
- Finds withdrawals where `cooling_off_until < now()` and status = `approved` and welfare_id is set
- Triggers B2C payout for each
- Updates status to `processing`

### Step 4: Admin Cancel Endpoint
- Add cancel capability to existing withdrawals-crud or welfare-withdrawal-approve function
- Admin can set status to `cancelled` during cooling period

### Step 5: UI - Welfare Withdrawal Status Component
- New component `WelfareWithdrawalStatus` shown on welfare detail page
- Shows active/recent withdrawals with:
  - Who requested it
  - Amount
  - Approval status (pending both, one approved, both approved)
  - 24-hour countdown timer (if both approved)
  - Cancel button (admin only)
- Visible to all welfare members

### Step 6: Integrate into WelfareDetail page
- Add the new status component to the welfare detail page
