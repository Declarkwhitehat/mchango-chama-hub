# Mchango CRUD Tests

## Prerequisites
1. At least one user with KYC status = 'approved'
2. Valid JWT token for authenticated requests
3. curl or Postman installed

## Test Suite

### Test 1: Slug Uniqueness Validation

**Purpose:** Verify that duplicate slugs are automatically handled

**Steps:**
```bash
# 1. Create first mchango
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Unique Test Campaign",
    "target_amount": 50000
  }'

# 2. Create duplicate with same title
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Unique Test Campaign",
    "target_amount": 50000
  }'

# 3. Verify both exist with different slugs
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud
```

**Expected Result:**
- First mchango has slug: `unique-test-campaign`
- Second mchango has slug: `unique-test-campaign-<timestamp>`
- Both are retrievable independently

### Test 2: KYC Requirement Enforcement

**Purpose:** Verify only KYC-approved users can create mchangos

**Steps:**
```bash
# 1. Get profile KYC status
curl https://ahhcbwbvueimezmtftte.supabase.co/rest/v1/profiles?select=kyc_status \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "apikey: <YOUR_ANON_KEY>"

# 2. Try to create mchango (should fail if kyc_status != 'approved')
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <NON_KYC_USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Without KYC",
    "target_amount": 10000
  }'
```

**Expected Result:**
- Response: 403 Forbidden
- Error message: "KYC verification required"
- Includes current kyc_status in response

### Test 3: Slug-based Retrieval

**Purpose:** Verify mchangos can be accessed by slug

**Steps:**
```bash
# 1. Create mchango with specific slug
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Slug Access",
    "slug": "my-custom-slug",
    "target_amount": 25000
  }'

# 2. Retrieve by custom slug
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/my-custom-slug

# 3. Retrieve by UUID (should also work)
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/<UUID_FROM_STEP_1>
```

**Expected Result:**
- Both slug and UUID retrieval return same mchango
- Data matches what was created

### Test 4: Managers Array Validation

**Purpose:** Verify managers array constraints

**Steps:**
```bash
# 1. Create mchango with 2 managers (valid)
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Managers",
    "target_amount": 30000,
    "managers": ["<UUID1>", "<UUID2>"]
  }'

# 2. Try to create with 3 managers (should fail)
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Too Many Managers",
    "target_amount": 30000,
    "managers": ["<UUID1>", "<UUID2>", "<UUID3>"]
  }'

# 3. Try to include creator in managers array (should fail)
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Creator in Managers",
    "target_amount": 30000,
    "managers": ["<YOUR_USER_ID>"]
  }'
```

**Expected Result:**
- Test 1: Success (201)
- Test 2: Error - "Maximum of 2 additional managers allowed"
- Test 3: Error - "Creator is automatically a manager"

### Test 5: Public/Private Visibility

**Purpose:** Verify public/private mchango access control

**Steps:**
```bash
# 1. Create private mchango
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Private Campaign",
    "target_amount": 40000,
    "is_public": false
  }'

# 2. List all mchangos (authenticated)
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"

# 3. List all mchangos (unauthenticated)
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud

# 4. Try to access private mchango by slug (unauthenticated)
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/private-campaign
```

**Expected Result:**
- Authenticated list: Includes private mchango
- Unauthenticated list: Only public mchangos
- Unauthenticated slug access: 404 or no data

### Test 6: CRUD Operations

**Purpose:** Verify complete CRUD lifecycle

**Steps:**
```bash
# CREATE
RESPONSE=$(curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "CRUD Test Campaign",
    "description": "Testing full lifecycle",
    "target_amount": 60000,
    "category": "test"
  }')
ID=$(echo $RESPONSE | jq -r '.data.id')

# READ
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/$ID

# UPDATE
curl -X PUT https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/$ID \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated CRUD Test",
    "target_amount": 75000
  }'

# DELETE (soft delete)
curl -X DELETE https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/$ID \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"

# VERIFY DELETED
curl https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud/$ID
```

**Expected Result:**
- Create: Returns new mchango with ID
- Read: Returns created data
- Update: Returns updated values
- Delete: Status changes to 'cancelled'
- Verify: No longer in active list

### Test 7: Required Fields Validation

**Purpose:** Verify required field validation

**Steps:**
```bash
# 1. Try without title
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "target_amount": 10000
  }'

# 2. Try without target_amount
curl -X POST https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Missing Amount"
  }'
```

**Expected Result:**
- Both requests: 400 Bad Request
- Error: "Missing required fields: title, target_amount"

## Running All Tests

```bash
# Save this as run_mchango_tests.sh
#!/bin/bash

export JWT_TOKEN="<YOUR_JWT_TOKEN>"
export BASE_URL="https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/mchango-crud"

echo "Running Mchango CRUD Tests..."

# Add all test commands here
# Each test should output PASS or FAIL
```

## Test Data Cleanup

```sql
-- Clean up test mchangos
DELETE FROM public.mchango 
WHERE title LIKE '%Test%' 
OR title LIKE '%CRUD%' 
OR slug LIKE '%test%';
```

## Automated Testing

Consider using:
- Postman Collection (see POSTMAN_COLLECTION.json)
- Jest for JavaScript tests
- Python pytest for backend testing

## Success Criteria

✅ All slug duplicates handled correctly
✅ KYC enforcement prevents unauthorized creation
✅ Slug and UUID retrieval both work
✅ Managers array validation enforced
✅ Public/private visibility respected
✅ Complete CRUD lifecycle functional
✅ Required fields validated
