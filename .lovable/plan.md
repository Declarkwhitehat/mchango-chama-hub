

# Fix Welfare Payment Matching & Withdrawal ID-Based Lookup

## Problems Identified

1. **Offline payment with member ID `Q8KKUG7V` doesn't reflect**: The C2B confirm function currently matches welfare payments by **group-level** `paybill_account_id` or `group_code` (e.g., `WFYWFHXY` or `Q8KK`), but NOT by individual `member_code`. When someone pays using their member ID as the account number, no match is found.

2. **Payment lookup query uses wrong column**: `WelfarePaymentLookup` queries `welfare_contributions` for a column called `amount` which doesn't exist — the correct column is `gross_amount`.

3. **Withdrawal uses phone number instead of member ID**: The withdrawal form asks for a raw phone number, which could send money to non-members. It should accept a member ID and auto-resolve the phone.

---

## Plan

### Step 1: Fix C2B to match welfare member IDs
**File**: `supabase/functions/c2b-confirm-payment/index.ts`

Before checking welfare group codes, add a lookup for `welfare_members.member_code` matching the normalized account number. If found, directly identify the welfare and member — skip the phone-matching loop entirely. This ensures paying with `Q8KKUG7V` correctly credits the right member.

### Step 2: Fix payment lookup column reference
**File**: `src/components/welfare/WelfarePaymentLookup.tsx`

Change the query from selecting `amount` (doesn't exist) to `gross_amount`. Update the total calculation and table display to use `gross_amount` consistently. Remove `contribution_type` (also doesn't exist in the table).

### Step 3: Replace phone input with member ID in withdrawals
**File**: `src/components/welfare/WelfareWithdrawalRequest.tsx`

- Replace the "Recipient Phone Number" field with a "Recipient Member ID" field
- On form submit, look up the member ID in `welfare_members` to verify it belongs to this welfare and is active
- Fetch the associated phone number from `profiles` via the member's `user_id`
- Store both the member ID and resolved phone in the withdrawal notes
- Show the resolved member name for confirmation before submitting

---

## Technical Details

**C2B member_code match** (before the existing welfare group_code/paybill match):
```
welfare_members.member_code = upperAccountNumber → get welfare_id, member_id, user_id
```

**Withdrawal phone resolution**:
```
welfare_members(member_code) → user_id → profiles(phone)
```

**No database migrations needed** — all required columns already exist.

