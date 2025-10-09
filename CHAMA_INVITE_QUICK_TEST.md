# Quick Manual Test Guide - Chama Invite & Join Flow

## Prerequisites
✅ Two test users with approved KYC status
- **Manager User**: Will create and manage the chama
- **Join User**: Will join using invite code

---

## Step-by-Step Test Flow

### 1. Create Test Chama (Manager User)
1. Login as Manager User
2. Navigate to: `/chama/create`
3. Fill in the form:
   - Name: "Test Savings Group"
   - Description: "Testing invite flow"
   - Contribution: 5000 KES
   - Frequency: Monthly
   - Min Members: 5
   - Max Members: 10
   - Visibility: Public
4. Click "Create Chama Group"
5. ✅ **Verify**: Redirected to `/chama/<slug>` with success message
6. ✅ **Verify**: You see "Manager" badge on the page

---

### 2. Generate Invite Codes (Manager User)
1. On the chama detail page, scroll to "Generate Invite Codes" section
2. Enter number: **10**
3. Click "Generate"
4. ✅ **Verify**: Success toast appears
5. ✅ **Verify**: 10 codes appear in "Invite Codes" list below
6. ✅ **Verify**: Each code:
   - Is 8 characters long
   - Shows "Active" badge
   - Has "Copy Link" button
7. Click "Copy Link" on any code
8. ✅ **Verify**: Toast says "Invite link copied"
9. Save one code (e.g., "ABC12XYZ") for next steps

---

### 3. Join Request (Join User)
1. **Logout** from Manager account
2. **Login** as Join User
3. Navigate to: `/chama/join`
4. Enter the copied code (e.g., "ABC12XYZ")
5. Click "Validate"
6. ✅ **Verify**: Chama details appear:
   - Chama name
   - Description
   - Contribution amount & frequency
   - Success alert: "Valid invite code!"
7. Click "Submit Join Request"
8. ✅ **Verify**: Success toast: "Join request submitted..."
9. ✅ **Verify**: Redirected to chama page
10. ✅ **Verify**: Message shown: "Your join request is pending manager approval"
11. ✅ **Verify**: Cannot see member list or tabs

---

### 4. Approve Join Request (Manager User)
1. **Logout** from Join User
2. **Login** as Manager User
3. Navigate to chama detail page (`/chama/<slug>`)
4. ✅ **Verify**: "Pending Join Requests (1)" section appears at top
5. ✅ **Verify**: Pending request shows:
   - Join User's name and email
   - Request timestamp
   - Member code (e.g., "test-savin-M002")
   - Position badge (e.g., "#2")
   - "Approve" and "Reject" buttons
6. Click "Approve" button
7. ✅ **Verify**: Success toast: "Member approved successfully"
8. ✅ **Verify**: Request disappears from pending list
9. ✅ **Verify**: In "Invite Codes" section:
   - The used code now shows "Used" badge
   - Shows "Used by: [Join User Name]" with timestamp

---

### 5. Verify Member Access (Join User)
1. **Logout** from Manager
2. **Login** as Join User
3. Navigate to chama page
4. ✅ **Verify**: "Members" and "Details" tabs are now visible
5. ✅ **Verify**: No longer see "pending approval" message
6. Click "Members" tab
7. ✅ **Verify**: See member list with:
   - Manager User (Position #1, Manager badge)
   - Join User (Position #2)
   - Member codes displayed
8. ✅ **Verify**: Both users have unique member codes
9. ✅ **Verify**: order_index is sequential (1, 2)

---

### 6. Verify Database Records

Open backend/database interface and run:

```sql
-- Check chama members
SELECT 
  cm.member_code,
  cm.order_index,
  cm.approval_status,
  cm.joined_at,
  cm.is_manager,
  p.full_name
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
WHERE cm.chama_id = '<YOUR_CHAMA_ID>'
ORDER BY cm.order_index;
```

✅ **Expected**:
| member_code | order_index | approval_status | is_manager | full_name |
|-------------|-------------|-----------------|------------|-----------|
| test-savin-M001 | 1 | approved | true | Manager Name |
| test-savin-M002 | 2 | approved | false | Join User Name |

```sql
-- Check invite codes
SELECT 
  code,
  is_active,
  used_by,
  used_at,
  expires_at
FROM chama_invite_codes
WHERE chama_id = '<YOUR_CHAMA_ID>'
ORDER BY created_at DESC
LIMIT 10;
```

✅ **Expected**:
- 1 code shows `used_by` = Join User ID, `is_active` = false
- 9 codes show `used_by` = null, `is_active` = true

---

### 7. Test Rejection Flow (Optional)

1. Generate 1 more invite code as Manager
2. Have a third test user join using this code
3. As Manager, click "Reject" instead of "Approve"
4. ✅ **Verify**: `approval_status` = 'rejected' in database
5. ✅ **Verify**: Third user cannot access member details

---

### 8. Test Edge Cases

#### 8.1 Cannot Join Twice
1. As Join User (already approved), try to use another invite code
2. ✅ **Verify**: Error: "You are already a member of this chama"

#### 8.2 Used Code Cannot Be Reused
1. Try to validate the already-used code
2. ✅ **Verify**: Error: "Invalid or expired invite code"

#### 8.3 Non-Manager Cannot Approve
1. Login as Join User (approved member, not manager)
2. Try to access approval API directly (if possible)
3. ✅ **Verify**: 403 Forbidden error

---

## Success Criteria

✅ All 3 key features working:
1. **Invite Code Generation**: Manager creates 10 codes successfully
2. **Join Flow**: User joins with code, request pending
3. **Manager Approval**: Manager approves, member gets full access

✅ All 3 data points recorded:
1. **member_code**: Unique code in format `slug-M00X`
2. **join_date**: `joined_at` timestamp set correctly
3. **order_index**: Sequential numbering (1, 2, 3...)

✅ Member Privacy:
1. Non-members cannot see member list
2. Pending members have limited access
3. Approved members see full details

---

## If Tests Fail

### Issue: "Failed to generate invite codes"
- Check: Is user a manager? (`is_manager = true` and `approval_status = 'approved'`)
- Check: Are there available spots? (current members < max_members)
- Check console logs in browser and edge function logs

### Issue: "Invite code invalid"
- Check: Is code entered correctly? (case-insensitive, 8 chars)
- Check: Is code active? (`is_active = true`, `used_by = null`)
- Check: Has it expired? (`expires_at` is null or in future)

### Issue: "Cannot approve member"
- Check: Is approver a manager?
- Check: Does member have `approval_status = 'pending'`?

### Issue: Authentication errors (-2xx)
- Check: Is JWT being sent? (Authorization header in network tab)
- Check: Is session valid? (try logout/login)
- Check: `verify_jwt` setting in `supabase/config.toml`

---

## Next Steps After Successful Test

1. ✅ Mark acceptance tests as passed
2. Test with 10 different users joining simultaneously
3. Verify no order_index collisions
4. Test expiring codes (set `expires_at` to past date)
5. Load test with 50+ codes generation

---

**Test Date**: _________________
**Tester**: _________________
**Result**: ✅ PASS / ❌ FAIL
**Notes**: _________________
