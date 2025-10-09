# Chama Invite & Join Flow - Acceptance Tests

## Overview
This document provides comprehensive testing scenarios for the Chama invite code generation, member join requests, and manager approval flow.

---

## Prerequisites

### Test Users Setup

#### Manager (User A): KYC Approved, Created a Chama
```sql
-- Ensure user has approved KYC
UPDATE profiles 
SET kyc_status = 'approved'
WHERE email = 'manager@example.com';

-- Verify they created a chama
SELECT c.*, cm.* 
FROM chama c
JOIN chama_members cm ON c.id = cm.chama_id
WHERE c.created_by = (SELECT id FROM profiles WHERE email = 'manager@example.com')
AND cm.is_manager = true;
```

#### Member (User B): KYC Approved, Has Account
```sql
-- Ensure user has account and approved KYC
UPDATE profiles 
SET kyc_status = 'approved'
WHERE email = 'member@example.com';
```

#### Guest (User C): No Account
- Not signed up yet
- Will need to create account before joining

---

## Test Scenarios

### Test 1: Manager Generates Invite Codes ✅

**Preconditions:**
- User A is logged in
- User A is manager of a chama
- Chama has available spots (current members < max_members)

**Steps:**
1. Navigate to chama detail page: `/chama/<slug>`
2. Scroll to "Generate Invite Codes" section
3. Enter number of codes to generate: 10
4. Click "Generate"

**Expected Results:**
- ✅ Success toast appears: "Generated 10 invite code(s)"
- ✅ 10 new codes appear in "Invite Codes" list
- ✅ Each code is 8 characters, uppercase, alphanumeric
- ✅ Each code is marked as "Active"
- ✅ Each code has creation timestamp
- ✅ "Copy Link" button available for each code

**Verification Query:**
```sql
-- Verify codes were created
SELECT * FROM chama_invite_codes 
WHERE chama_id = '<chama_id>'
AND created_by = (SELECT id FROM profiles WHERE email = 'manager@example.com')
ORDER BY created_at DESC 
LIMIT 10;

-- Should return 10 rows with:
-- - is_active = true
-- - used_by = NULL
-- - used_at = NULL
-- - code length = 8
```

**Edge Cases:**
- **Too many codes:** Try generating more codes than available spots
  - Expected: Error message "Only X spots available. Cannot generate Y codes."
- **Zero codes:** Try generating 0 codes
  - Expected: Validation error
- **Non-manager:** Try as regular member
  - Expected: Section not visible

---

### Test 2: Copy Invite Link ✅

**Preconditions:**
- Manager has generated invite codes

**Steps:**
1. View "Invite Codes" list
2. Click "Copy Link" button for a code
3. Paste into browser or text editor

**Expected Results:**
- ✅ Toast appears: "Invite link copied to clipboard"
- ✅ Button shows "Copied" with checkmark icon for 2 seconds
- ✅ Copied URL format: `https://<domain>/chama/join?code=<CODE>`
- ✅ URL is valid and accessible

---

### Test 3: User Validates Invite Code ✅

**Preconditions:**
- User B is logged in
- Manager has generated invite codes
- User B has an active invite code

**Steps:**
1. Navigate to `/chama/join?code=<CODE>` (via copied link)
2. Observe auto-validation
3. OR manually enter code and click "Validate"

**Expected Results:**
- ✅ Success alert appears: "Valid invite code! You can join this chama."
- ✅ Chama details displayed:
  - Name
  - Description
  - Contribution amount
  - Contribution frequency
- ✅ "Submit Join Request" button enabled
- ✅ Warning shown: "Your join request will be pending until a manager approves it"

**Verification:**
Code validation doesn't modify database yet - only checks validity.

**Edge Cases:**
- **Invalid code:** Try code "INVALID1"
  - Expected: Error "Invalid or expired invite code"
- **Used code:** Try a code that's already been used
  - Expected: Error "Invalid or expired invite code"
- **Expired code:** Try an expired code (if you set expires_at)
  - Expected: Error "Invite code has expired"

---

### Test 4: User Submits Join Request ✅

**Preconditions:**
- User B validated a code successfully
- User B viewing chama details on join page

**Steps:**
1. Click "Submit Join Request"
2. Wait for response

**Expected Results:**
- ✅ Success toast: "Join request submitted. Awaiting manager approval."
- ✅ User redirected to chama detail page: `/chama/<slug>`
- ✅ Page shows "Your join request is pending manager approval"
- ✅ Tabs (Members, Details) are hidden
- ✅ User cannot see member list or internal details

**Verification Query:**
```sql
-- Verify pending membership created
SELECT cm.*, p.full_name, p.email
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
WHERE cm.chama_id = '<chama_id>'
AND cm.user_id = (SELECT id FROM profiles WHERE email = 'member@example.com')
AND cm.approval_status = 'pending';

-- Should return 1 row with:
-- - approval_status = 'pending'
-- - status = 'active'
-- - is_manager = false
-- - order_index = auto-generated (e.g., 2, 3, 4...)
-- - member_code = auto-generated (e.g., 'chama-slug-M002')

-- Verify invite code was marked as used
SELECT * FROM chama_invite_codes
WHERE code = '<CODE>'
AND used_by = (SELECT id FROM profiles WHERE email = 'member@example.com')
AND is_active = false;
```

**Edge Cases:**
- **Already member:** Try joining again with same user
  - Expected: Error "You are already a member of this chama"
- **Pending request exists:** Try joining again with pending request
  - Expected: Error "You already have a pending join request for this chama"
- **Not logged in:** Try joining without authentication
  - Expected: Redirect to /auth with returnTo parameter

---

### Test 5: Manager Views Pending Join Requests ✅

**Preconditions:**
- User A is manager
- User B submitted join request (pending)

**Steps:**
1. User A navigates to chama detail page
2. Scroll to "Pending Join Requests" section

**Expected Results:**
- ✅ Section visible at top: "Pending Join Requests (1)"
- ✅ Request card shows:
  - User B's full name
  - User B's email
  - Request timestamp
  - Member code assigned
  - Position number (order_index)
- ✅ Two buttons visible:
  - "Approve" (green/default)
  - "Reject" (red/destructive)

**Verification:**
Manager view should refresh automatically or on reload to show new requests.

---

### Test 6: Manager Approves Join Request ✅

**Preconditions:**
- User A viewing pending requests
- User B has pending join request

**Steps:**
1. Click "Approve" button for User B's request
2. Wait for response

**Expected Results:**
- ✅ Success toast: "Join request approved"
- ✅ Request disappears from "Pending Join Requests" section
- ✅ Member count increases by 1
- ✅ User B now appears in members list (if manager views Members tab)

**Verification Query:**
```sql
-- Verify approval status updated
SELECT cm.*, p.full_name
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
WHERE cm.chama_id = '<chama_id>'
AND cm.user_id = (SELECT id FROM profiles WHERE email = 'member@example.com')
AND cm.approval_status = 'approved';

-- Should return 1 row with approval_status = 'approved'
```

**User B's View After Approval:**
1. User B refreshes chama detail page
2. Expected:
   - ✅ "Pending approval" message disappears
   - ✅ Tabs (Members, Details) now visible
   - ✅ Can see member list
   - ✅ Can see own name in member list with correct position

---

### Test 7: Manager Rejects Join Request ❌

**Preconditions:**
- User C submitted join request (pending)
- User A is manager

**Steps:**
1. User A views pending requests
2. Click "Reject" button for User C's request
3. Wait for response

**Expected Results:**
- ✅ Success toast: "Join request rejected"
- ✅ Request disappears from "Pending Join Requests" section
- ✅ User C's membership status set to 'rejected'

**Verification Query:**
```sql
-- Verify rejection
SELECT * FROM chama_members
WHERE chama_id = '<chama_id>'
AND user_id = (SELECT id FROM profiles WHERE email = 'rejected@example.com')
AND approval_status = 'rejected';
```

**User C's View After Rejection:**
- User C can try joining again with a new invite code
- Previous rejected status doesn't block new attempts

---

### Test 8: Order Index Assignment ✅

**Preconditions:**
- Manager created chama (order_index = 1)
- Multiple users join in sequence

**Test Flow:**
1. User B joins → Pending
2. User C joins → Pending  
3. User D joins → Pending
4. Manager approves B
5. Manager approves C
6. Manager approves D

**Expected Results:**
- ✅ Manager (creator): order_index = 1
- ✅ User B: order_index = 2
- ✅ User C: order_index = 3
- ✅ User D: order_index = 4

**Verification Query:**
```sql
-- Check order assignment
SELECT 
  cm.order_index,
  cm.member_code,
  p.full_name,
  cm.joined_at,
  cm.approval_status
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
WHERE cm.chama_id = '<chama_id>'
ORDER BY cm.order_index ASC;

-- Should show sequential order_index starting from 1
```

---

### Test 9: Member Code Generation ✅

**Preconditions:**
- Chama slug = "women-empowerment-group"
- Multiple members join

**Expected Member Codes:**
- Member 1 (creator): `women-empo-M001`
- Member 2: `women-empo-M002`
- Member 3: `women-empo-M003`
- Member 10: `women-empo-M010`

**Pattern:**
- First 10 chars of slug (truncated)
- Dash separator
- "M" prefix
- 3-digit padded number

**Verification Query:**
```sql
SELECT order_index, member_code
FROM chama_members
WHERE chama_id = '<chama_id>'
ORDER BY order_index ASC;

-- Verify format matches pattern
```

---

### Test 10: Member Privacy (RLS) ✅

**Security Test:** Only members can see internal chama details

**Test 10a: Non-Member View**
1. User E (not a member) navigates to `/chama/<slug>`
2. Expected:
   - ✅ Can see chama name, description
   - ✅ Can see contribution amount/frequency
   - ✅ Cannot see member list
   - ✅ Cannot see tabs (Members, Details)
   - ✅ Message: "You need to join this chama to view member details"

**Test 10b: Pending Member View**
1. User F submitted join request (pending)
2. Expected:
   - ✅ Can see basic chama info
   - ✅ Cannot see member list
   - ✅ Message: "Your join request is pending manager approval"

**Test 10c: Approved Member View**
1. User B (approved member) views chama page
2. Expected:
   - ✅ Can see full member list
   - ✅ Can access Members and Details tabs
   - ✅ Can see order_index and member_code for all

**Verification:**
Test by creating tokens for different users and making API calls:
```javascript
// Should fail for non-member
const { data, error } = await supabase
  .from('chama_members')
  .select('*')
  .eq('chama_id', chamaId);
// Returns empty or error due to RLS
```

---

### Test 11: Maximum Members Limit ✅

**Preconditions:**
- Chama has max_members = 5
- Currently 4 approved members
- 1 spot remaining

**Test 11a: Generate More Codes Than Spots**
1. Manager tries to generate 3 codes
2. Expected: ❌ Error "Only 1 spot available. Cannot generate 3 codes."

**Test 11b: Join When Full**
1. 5th user joins successfully (pending)
2. Manager approves (now at max)
3. 6th user tries to join with valid code
4. Expected: ❌ Error (should be prevented by business logic)

**Verification Query:**
```sql
-- Check member count vs max
SELECT 
  c.max_members,
  COUNT(cm.id) as current_members
FROM chama c
LEFT JOIN chama_members cm ON c.id = cm.chama_id 
  AND cm.approval_status = 'approved'
WHERE c.id = '<chama_id>'
GROUP BY c.max_members;
```

---

### Test 12: Join Date Recording ✅

**Verification:** Ensure `joined_at` is recorded when user submits request

**Steps:**
1. User submits join request at specific time
2. Check `joined_at` timestamp

**Expected:**
- ✅ `joined_at` = timestamp of initial join request
- ✅ `joined_at` doesn't change when approved
- ✅ Can be used to sort by "first come, first served"

**Query:**
```sql
SELECT 
  p.full_name,
  cm.order_index,
  cm.joined_at,
  cm.approval_status
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
WHERE cm.chama_id = '<chama_id>'
ORDER BY cm.joined_at ASC;
```

---

### Test 13: Guest User Flow (Must Sign Up First) ✅

**Scenario:** Guest user receives invite link but has no account

**Steps:**
1. Guest clicks invite link: `/chama/join?code=<CODE>`
2. System detects no authentication
3. Redirect to `/auth?returnTo=/chama/join?code=<CODE>`
4. Guest signs up / logs in
5. After auth, redirects back to `/chama/join?code=<CODE>`
6. Code validates automatically
7. Guest (now logged in) submits join request

**Expected:**
- ✅ Seamless flow from invite link → signup → join
- ✅ Code preserved through auth flow
- ✅ Auto-validation after auth

---

## Demo Script

### Complete 10-Member Join Flow

**Scenario:** Manager creates chama, generates 10 codes, 10 users join

**Setup:**
- Manager creates chama "Tech Savers 2025"
- max_members = 15
- Manager is Member #1 (auto-assigned)

**Step 1: Generate Codes**
1. Manager logs in
2. Navigate to `/chama/tech-savers-2025`
3. Scroll to "Generate Invite Codes"
4. Enter: 10
5. Click "Generate"
6. Verify 10 codes created (e.g., A1B2C3D4, E5F6G7H8, ...)

**Step 2: Share Codes**
1. Copy each code link
2. Share with 10 different users via email/WhatsApp

**Step 3: Users Join**
Users 2-11 perform these steps:
1. Click invite link
2. Sign up / Log in (if needed)
3. Validate code (auto or manual)
4. View chama details
5. Click "Submit Join Request"
6. See "Pending approval" message

**Step 4: Manager Approves**
1. Manager refreshes chama page
2. See "Pending Join Requests (10)"
3. Review each request:
   - Name
   - Email
   - Assigned member code (M002-M011)
   - Assigned order (2-11)
4. Click "Approve" for each

**Step 5: Verify Members**
1. Manager views "Members" tab
2. See 11 total members:
   - Tech Savers-M001: Manager (Position #1)
   - Tech Savers-M002: User B (Position #2)
   - Tech Savers-M003: User C (Position #3)
   - ...
   - Tech Savers-M011: User K (Position #11)

**Verification Query:**
```sql
SELECT 
  cm.order_index,
  cm.member_code,
  p.full_name,
  cm.joined_at
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
WHERE cm.chama_id = (SELECT id FROM chama WHERE slug = 'tech-savers-2025')
AND cm.approval_status = 'approved'
ORDER BY cm.order_index ASC;

-- Should return 11 rows (1 manager + 10 members)
-- order_index: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
-- member_code: tech-saver-M001, tech-saver-M002, ..., tech-saver-M011
```

---

## Edge Cases & Error Scenarios

### Edge Case 1: Duplicate Join Attempts
**Scenario:** User tries to join same chama multiple times
**Expected:** Error after first join, whether pending or approved

### Edge Case 2: Expired Codes
**Test:** Set `expires_at` to past date
**Expected:** Validation fails with "Invite code has expired"

### Edge Case 3: Code Case Sensitivity
**Test:** Enter code in lowercase
**Expected:** System converts to uppercase, validates successfully

### Edge Case 4: Manager Leaves Chama
**Scenario:** Only manager leaves/removes themselves
**Expected:** Need business rule - require at least 1 manager, or auto-assign

### Edge Case 5: Concurrent Join Requests
**Test:** 5 users join simultaneously when only 3 spots left
**Expected:** First 3 succeed, last 2 fail (or pending but can't be approved)

---

## Summary Checklist

### Invite Code Generation
- [ ] Manager can generate multiple codes (1-20)
- [ ] Codes are unique, 8 chars, uppercase
- [ ] Codes respect available spots limit
- [ ] Manager can copy invite links
- [ ] Codes list shows status (Active/Used)

### Join Request Flow
- [ ] Users can validate codes
- [ ] Valid code shows chama details
- [ ] Join request creates pending membership
- [ ] Order index assigned sequentially
- [ ] Member code generated correctly
- [ ] Join date recorded accurately
- [ ] Invite code marked as used

### Manager Approval
- [ ] Manager sees pending requests list
- [ ] Manager can approve requests
- [ ] Manager can reject requests
- [ ] Approved members get full access
- [ ] Rejected members can try again

### Privacy & Security
- [ ] Non-members cannot see member list
- [ ] Pending members cannot see internal details
- [ ] Approved members can see everything
- [ ] RLS policies enforce privacy

### Business Rules
- [ ] Maximum members enforced
- [ ] Cannot generate more codes than spots
- [ ] Cannot join same chama twice
- [ ] Order index preserves join sequence
- [ ] Commission rate (5%) stored for payout calculations

### User Experience
- [ ] Guest users redirected to auth
- [ ] Auth redirects back to join page with code
- [ ] Clear error messages for all failures
- [ ] Success toasts for all actions
- [ ] Loading states during API calls
