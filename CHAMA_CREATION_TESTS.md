# Chama Creation - Acceptance Tests

## Overview
This document provides comprehensive testing scenarios for the Chama creation feature, including KYC validation, constraint validation, and manager assignment.

---

## Prerequisites

### 1. Test Users Setup

#### User A: KYC Approved User
```sql
-- Check/Update KYC status
UPDATE profiles 
SET kyc_status = 'approved',
    kyc_submitted_at = now(),
    kyc_reviewed_at = now()
WHERE email = 'test-approved@example.com';
```

#### User B: KYC Pending User
```sql
-- Check/Update KYC status
UPDATE profiles 
SET kyc_status = 'pending',
    kyc_submitted_at = now()
WHERE email = 'test-pending@example.com';
```

#### User C: No KYC Submission
```sql
-- Check/Update KYC status
UPDATE profiles 
SET kyc_status = 'pending',
    kyc_submitted_at = NULL
WHERE email = 'test-nokyc@example.com';
```

---

## Test Scenarios

### Test 1: KYC Approved User Can Create Chama ✅

**Preconditions:**
- User is logged in
- User has `kyc_status = 'approved'`

**Steps:**
1. Navigate to `/chama-create`
2. Verify green success alert showing "Your KYC is approved. You can now create a chama."
3. Fill in the form:
   - Name: "Women Empowerment Group"
   - Description: "A group focused on women's financial empowerment"
   - Contribution Amount: 5000
   - Frequency: Monthly
   - Min Members: 5 (default)
   - Max Members: 20
   - Visibility: Public
   - Payout Order: Auto by Join Date
4. Click "Create Chama Group"

**Expected Results:**
- ✅ Success toast appears: "Chama created successfully"
- ✅ User is redirected to `/chama/<slug>`
- ✅ User is automatically added as first manager in `chama_members` table
- ✅ `is_manager = true` for the creator
- ✅ Member code generated (format: `women-empower-M001`)
- ✅ Chama has `commission_rate = 0.05` (5%)

**Verification Query:**
```sql
-- Verify chama was created
SELECT * FROM chama 
WHERE name = 'Women Empowerment Group';

-- Verify creator is a manager
SELECT cm.*, p.full_name 
FROM chama_members cm
JOIN profiles p ON cm.user_id = p.id
JOIN chama c ON cm.chama_id = c.id
WHERE c.name = 'Women Empowerment Group'
AND cm.is_manager = true;
```

---

### Test 2: KYC Not Approved - Cannot Create Chama ❌

**Preconditions:**
- User is logged in
- User has `kyc_status = 'pending'` or `kyc_status = 'rejected'`

**Steps:**
1. Navigate to `/chama-create`
2. Observe the warning alert
3. Try to fill in the form

**Expected Results:**
- ✅ Warning alert appears: "You must complete KYC verification before creating a chama"
- ✅ All form fields are disabled
- ✅ Submit button is disabled
- ✅ Link to `/kyc-upload` is provided

**Verification:**
- Form inputs have `disabled` attribute
- Submit button has `disabled` attribute

---

### Test 3: Constraint Validation - Min Members ✅

**Preconditions:**
- User has approved KYC status

**Test 3a: Valid Min Members (5)**
1. Set Min Members: 5
2. Set Max Members: 20
3. Submit form

**Expected:** ✅ Success

**Test 3b: Invalid Min Members (< 5)**
1. Set Min Members: 3
2. Set Max Members: 20
3. Submit form

**Expected:** ❌ Backend returns error: "Minimum members must be at least 5"

---

### Test 4: Constraint Validation - Max Members ✅

**Preconditions:**
- User has approved KYC status

**Test 4a: Valid Max Members (≤ 100)**
1. Set Min Members: 5
2. Set Max Members: 100
3. Submit form

**Expected:** ✅ Success

**Test 4b: Invalid Max Members (> 100)**
1. Set Min Members: 5
2. Set Max Members: 150
3. Submit form

**Expected:** ❌ Backend returns error: "Maximum members cannot exceed 100"

**Test 4c: Max < Min**
1. Set Min Members: 20
2. Set Max Members: 10
3. Submit form

**Expected:** ❌ Backend returns error: "Maximum members must be greater than minimum members"

---

### Test 5: Contribution Frequency - Every N Days ✅

**Preconditions:**
- User has approved KYC status

**Test 5a: Every N Days with Valid Count**
1. Fill in basic info
2. Set Frequency: "Every N Days"
3. Verify "Every N Days (Number)" field appears
4. Set Every N Days: 14
5. Submit form

**Expected Results:**
- ✅ Success
- ✅ Chama has `contribution_frequency = 'every_n_days'`
- ✅ Chama has `every_n_days_count = 14`

**Test 5b: Every N Days without Count**
1. Fill in basic info
2. Set Frequency: "Every N Days"
3. Leave "Every N Days (Number)" empty
4. Submit form

**Expected:** ❌ Backend returns error: "Every N days count must be specified and greater than 0"

**Verification Query:**
```sql
SELECT name, contribution_frequency, every_n_days_count 
FROM chama 
WHERE contribution_frequency = 'every_n_days';
```

---

### Test 6: Visibility and Privacy Settings ✅

**Test 6a: Public Chama**
1. Set Visibility: "Public (Listable)"
2. Submit form
3. Verify chama appears in public listings

**Expected:**
- ✅ `is_public = true`
- ✅ Chama appears in GET /chama-crud response
- ✅ Chama appears in public listings

**Test 6b: Private Chama**
1. Set Visibility: "Private (Invite Only)"
2. Submit form

**Expected:**
- ✅ `is_public = false`
- ✅ Chama can be accessed directly by ID/slug
- ✅ Internal details still protected by RLS policies

**Verification Query:**
```sql
SELECT name, is_public 
FROM chama 
ORDER BY created_at DESC 
LIMIT 5;
```

---

### Test 7: Payout Order Settings ✅

**Test 7a: Auto by Join Date**
1. Set Payout Order: "Auto by Join Date"
2. Submit form

**Expected:**
- ✅ `payout_order = 'join_date'`

**Test 7b: Manager Override**
1. Set Payout Order: "Manager Override"
2. Submit form

**Expected:**
- ✅ `payout_order = 'manager_override'`

**Verification Query:**
```sql
SELECT name, payout_order 
FROM chama 
ORDER BY created_at DESC 
LIMIT 5;
```

---

### Test 8: Commission Rate Default ✅

**Preconditions:**
- User has approved KYC status

**Steps:**
1. Create a chama with all required fields
2. Do not specify commission_rate (should use default)

**Expected Results:**
- ✅ Chama has `commission_rate = 0.05` (5%)

**Verification Query:**
```sql
SELECT name, commission_rate 
FROM chama 
ORDER BY created_at DESC 
LIMIT 1;
```

---

### Test 9: Slug Generation ✅

**Preconditions:**
- User has approved KYC status

**Test 9a: Simple Name**
1. Name: "Tech Savers"
2. Submit form

**Expected:**
- ✅ Slug: `tech-savers`

**Test 9b: Name with Special Characters**
1. Name: "Women's #1 Empowerment Group!"
2. Submit form

**Expected:**
- ✅ Slug: `womens-1-empowerment-group`
- ✅ Special characters removed, spaces converted to hyphens

**Test 9c: Name with Multiple Spaces**
1. Name: "Tech    Savers    2025"
2. Submit form

**Expected:**
- ✅ Slug: `tech-savers-2025`
- ✅ Multiple spaces collapsed to single hyphen

**Verification Query:**
```sql
SELECT name, slug 
FROM chama 
ORDER BY created_at DESC 
LIMIT 3;
```

---

### Test 10: WhatsApp Link (Optional) ✅

**Test 10a: With WhatsApp Link**
1. Fill in all required fields
2. Add WhatsApp Link: "https://chat.whatsapp.com/ABC123"
3. Submit form

**Expected:**
- ✅ `whatsapp_link = 'https://chat.whatsapp.com/ABC123'`

**Test 10b: Without WhatsApp Link**
1. Fill in all required fields
2. Leave WhatsApp Link empty
3. Submit form

**Expected:**
- ✅ `whatsapp_link = NULL`

**Verification Query:**
```sql
SELECT name, whatsapp_link 
FROM chama 
ORDER BY created_at DESC 
LIMIT 2;
```

---

### Test 11: Manager Assignment via Trigger ✅

**Preconditions:**
- User has approved KYC status

**Steps:**
1. Create a new chama
2. Immediately query `chama_members` table

**Expected Results:**
- ✅ One row in `chama_members` for the creator
- ✅ `is_manager = true`
- ✅ `status = 'active'`
- ✅ `member_code` generated automatically (format: `<slug>-M001`)
- ✅ `user_id` matches creator's ID

**Verification Query:**
```sql
-- Check manager assignment
SELECT 
  c.name AS chama_name,
  cm.member_code,
  cm.is_manager,
  cm.status,
  p.full_name AS manager_name,
  p.email AS manager_email
FROM chama c
JOIN chama_members cm ON c.id = cm.chama_id
JOIN profiles p ON cm.user_id = p.id
WHERE c.created_by = cm.user_id
AND cm.is_manager = true
ORDER BY c.created_at DESC
LIMIT 5;
```

---

### Test 12: API Direct Call (Backend) ✅

**Using cURL:**
```bash
# Get auth token first
TOKEN="your-supabase-auth-token"

# Create chama via API
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/chama-crud \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test Group",
    "description": "Testing via direct API call",
    "contribution_amount": 3000,
    "contribution_frequency": "weekly",
    "min_members": 5,
    "max_members": 15,
    "is_public": true,
    "payout_order": "join_date"
  }'
```

**Expected Response:**
```json
{
  "data": {
    "id": "uuid",
    "name": "API Test Group",
    "slug": "api-test-group",
    "contribution_amount": 3000,
    "contribution_frequency": "weekly",
    "commission_rate": 0.05,
    "status": "active",
    ...
  }
}
```

---

## Demo Script

### Complete Demo Flow

**Scenario:** Manager creates a monthly savings chama for a women's empowerment group.

**Steps:**

1. **Login as KYC-Approved User**
   - Email: test-approved@example.com
   - Navigate to home page
   - Verify green KYC status indicator

2. **Navigate to Create Chama**
   - Click "Create Chama" button
   - Verify URL: `/chama-create`
   - See green alert: "Your KYC is approved. You can now create a chama."

3. **Fill Form**
   - Group Name: "Women Empowerment Chama 2025"
   - Description: "Monthly savings group for women entrepreneurs to pool resources and support business growth"
   - Contribution Amount: 10,000 KES
   - Frequency: Monthly
   - Min Members: 5 (default)
   - Max Members: 25
   - Visibility: Public (Listable)
   - Payout Order: Auto by Join Date
   - WhatsApp Link: https://chat.whatsapp.com/ABC123

4. **Submit Form**
   - Click "Create Chama Group"
   - Observe loading state
   - Success toast appears
   - Redirected to chama detail page

5. **Verify Creation**
   - On chama detail page: `/chama/women-empowerment-chama-2025`
   - See chama name, description
   - See "You are a Manager" badge/indicator
   - See member count: 1 member (creator)
   - Commission info displayed: 5%

6. **Database Verification**
   ```sql
   -- Verify chama
   SELECT * FROM chama 
   WHERE slug = 'women-empowerment-chama-2025';

   -- Verify manager
   SELECT cm.*, p.full_name 
   FROM chama_members cm
   JOIN profiles p ON cm.user_id = p.id
   JOIN chama c ON cm.chama_id = c.id
   WHERE c.slug = 'women-empowerment-chama-2025'
   AND cm.is_manager = true;
   ```

---

## Edge Cases & Error Scenarios

### Edge Case 1: Concurrent Slug Generation
**Scenario:** Two users create chamas with the same name simultaneously
**Expected:** Second chama gets unique slug (e.g., `tech-savers-2`)

### Edge Case 2: Very Long Names
**Test:** Create chama with 200+ character name
**Expected:** Name accepted, slug truncated appropriately

### Edge Case 3: Unicode Characters
**Test:** Name: "مجموعة الادخار" (Arabic) or "储蓄组" (Chinese)
**Expected:** Slug generated correctly, special chars handled

### Edge Case 4: Network Timeout
**Test:** Slow network during creation
**Expected:** Loading state shown, error handled gracefully

---

## Summary Checklist

### Core Functionality
- [ ] KYC-approved users can create chamas
- [ ] Non-approved users are blocked with clear message
- [ ] Min members >= 5 validation works
- [ ] Max members <= 100 validation works
- [ ] Max >= Min validation works
- [ ] Every N Days frequency works correctly
- [ ] Creator automatically becomes manager
- [ ] Manager row created in `chama_members`
- [ ] Member code generated automatically
- [ ] Slug generated from name
- [ ] Commission rate defaults to 5%

### UI/UX
- [ ] KYC status alerts display correctly
- [ ] Form fields disable when KYC not approved
- [ ] Success toast appears on creation
- [ ] Error messages are clear and helpful
- [ ] Loading states work properly
- [ ] Redirect to chama detail page works

### Business Rules
- [ ] Commission: 5% on total pool
- [ ] Public chamas are listable
- [ ] Private chamas are invite-only
- [ ] Payout order options work
- [ ] WhatsApp link optional field works

### Security
- [ ] RLS policies enforce KYC requirement
- [ ] Only authenticated users can create
- [ ] Creator ownership verified
- [ ] Manager privileges assigned correctly
