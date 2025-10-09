# Admin Panel & Search - Acceptance Tests

## Overview
Comprehensive testing guide for admin dashboard, search functionality, KYC verification with ID images, transaction management, audit logs, and CSV export.

## Prerequisites

### Create Admin Account
```sql
-- Insert admin role for user
INSERT INTO public.user_roles (user_id, role)
VALUES ('{user_uuid}', 'admin');

-- Verify
SELECT ur.role, p.full_name, p.email
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE ur.user_id = '{user_uuid}';
```

## Test Scenarios

### 1. Universal Search Tests

#### Test 1.1: Search Users by Name
**Given:** Multiple users exist in database  
**When:** Admin searches "John" with type "User"  
**Then:**
- All users with "John" in full_name appear
- Results show: name, email, ID number, phone
- KYC status badge displays
- "View KYC" button is present

#### Test 1.2: Search by Member Code
**Given:** Member exists with code "tech-savers-M003"  
**When:** Admin searches "tech-savers-M003" with type "Member Code"  
**Then:**
- Member result appears
- Shows member code, user name, chama name
- "View Chama" button navigates to chama detail page
- Full history accessible

#### Test 1.3: Search by Mchango Slug
**Given:** Mchango exists with slug "donate-for-school"  
**When:** Admin searches "donate-for-school" with type "Mchango Slug"  
**Then:**
- Mchango result appears
- Shows title, slug, amount raised/target
- "View" button navigates to mchango page
- Full campaign details accessible

#### Test 1.4: Search by Transaction ID
**Given:** Transaction with ID "abc-123-def-456"  
**When:** Admin searches transaction ID  
**Then:**
- Transaction result appears
- Shows amount, reference, user, date
- Status badge displays
- Can view full transaction details

#### Test 1.5: Search by Email
**Given:** User with email "jane@example.com"  
**When:** Admin searches "jane@example.com" with type "Email"  
**Then:**
- User result appears with exact match
- Shows all user details
- KYC status visible

#### Test 1.6: Search by Phone
**Given:** User with phone "+254712345678"  
**When:** Admin searches "+254712345678" with type "Phone"  
**Then:**
- User result appears
- Shows user details
- Phone number matches exactly

#### Test 1.7: Universal Search (All)
**Given:** Query matches multiple entity types  
**When:** Admin searches "tech" with type "All"  
**Then:**
- Results categorized by type
- Shows users, members, mchangos, chamas
- All relevant matches displayed
- Limited to 20 results per category

#### Test 1.8: No Results
**Given:** Search query has no matches  
**When:** Admin performs search  
**Then:**
- "No results found" message displays
- No errors thrown
- Can perform new search

### 2. KYC Verification with ID Images Tests

#### Test 2.1: View KYC Submission with ID Images
**Given:** User submitted KYC with front and back ID images  
**When:** Admin clicks "Review" on submission  
**Then:**
- ✅ **ID Front Image displays** in left column
- ✅ **ID Back Image displays** in right column
- Images are clickable to open full-size
- Signed URLs generated correctly
- Images load within 2 seconds

#### Test 2.2: Click to Enlarge ID Images
**Given:** Admin viewing KYC submission  
**When:** Admin clicks on ID image  
**Then:**
- Image opens in new tab at full resolution
- Signed URL is valid
- Image is viewable for full verification

#### Test 2.3: Approve KYC After Viewing IDs
**Given:** Admin has reviewed ID images  
**When:** Admin clicks "Approve" button  
**Then:**
- KYC status changes to "approved"
- Reviewed_at timestamp set
- Reviewed_by set to admin user ID
- Success toast appears
- Returns to submission list

#### Test 2.4: Reject KYC with Reason
**Given:** Admin identifies issue in ID images  
**When:** Admin enters rejection reason and clicks "Reject"  
**Then:**
- KYC status changes to "rejected"
- Rejection reason saved
- Reviewed_at and reviewed_by recorded
- User can see rejection reason
- Audit log created

#### Test 2.5: Missing ID Images
**Given:** User submitted KYC without uploading images  
**When:** Admin views submission  
**Then:**
- "No image uploaded" message displays
- Admin can still approve/reject based on other info
- No image loading errors

#### Test 2.6: Image Loading Error
**Given:** ID image URL is invalid or file deleted  
**When:** Admin attempts to view images  
**Then:**
- Error handled gracefully
- Placeholder or error message shown
- Can still review other submission details

### 3. Transactions Management Tests

#### Test 3.1: View Transactions Table
**Given:** Multiple transactions exist  
**When:** Admin opens Transactions tab  
**Then:**
- Last 100 transactions displayed
- Sorted by date (newest first)
- Shows all required columns
- Scrollable if > 10 entries

#### Test 3.2: Export Transactions to CSV
**Given:** Transactions table is populated  
**When:** Admin clicks "Export CSV"  
**Then:**
- CSV file downloads automatically
- Filename: `transactions_YYYY-MM-DD.csv`
- All transactions included
- Proper CSV formatting
- Opens in Excel/Sheets correctly

#### Test 3.3: Transaction Status Badges
**Given:** Transactions with various statuses  
**When:** Viewing transactions table  
**Then:**
- "completed" shows default badge (green)
- "pending" shows secondary badge
- "failed" shows destructive badge (red)
- "refunded" shows outline badge

#### Test 3.4: View Transaction Details
**Given:** Transaction in table  
**When:** Admin clicks action button  
**Then:**
- Navigates to transaction detail
- Shows full history
- Displays related entity (mchango/chama)

### 4. Audit Logs Tests

#### Test 4.1: View Audit Logs
**Given:** System has audit logs  
**When:** Admin opens Audit Logs tab  
**Then:**
- Last 100 logs displayed
- Shows timestamp, action, table, user, IP
- Sorted by date (newest first)

#### Test 4.2: Account Adjustment Audit
**Given:** Admin credits user account  
**When:** Adjustment is completed  
**Then:**
- Audit log entry created
- Shows action: UPDATE
- Records reason in new_values
- User ID and timestamp recorded

#### Test 4.3: KYC Approval Audit
**Given:** Admin approves/rejects KYC  
**When:** Decision is made  
**Then:**
- Audit log created (if configured)
- Records old and new status
- Tracks reviewer ID

### 5. Account Adjustment Tests

#### Test 5.1: Credit User Account
**Given:** Admin has user ID  
**When:** Admin credits KES 500 with reason "Referral bonus"  
**Then:**
- Transaction created with type "donation"
- Amount: KES 500
- Reference: ADMIN-{timestamp}
- Status: completed
- Audit log entry created
- Success toast appears

#### Test 5.2: Debit User Account
**Given:** User has sufficient balance  
**When:** Admin debits KES 200 with reason "Reversal"  
**Then:**
- Transaction created with type "payout"
- Amount: KES 200 (negative effect)
- Audit log entry created
- Reason recorded

#### Test 5.3: Validation - Empty Reason
**Given:** Admin enters user ID and amount  
**When:** Admin tries to submit without reason  
**Then:**
- Form validation fails
- Error message: "All fields are required"
- Transaction not created

#### Test 5.4: Validation - Invalid Amount
**Given:** Admin enters negative or zero amount  
**When:** Form submitted  
**Then:**
- Error: "Invalid amount"
- No transaction created

#### Test 5.5: Invalid User ID
**Given:** Admin enters non-existent user ID  
**When:** Adjustment submitted  
**Then:**
- Database error caught
- Error toast displays
- No transaction created

### 6. CSV Export Tests

#### Test 6.1: Export Transactions
**Given:** 50 transactions exist  
**When:** Admin exports transactions  
**Then:**
- CSV includes all 50 transactions
- Headers: ID, Date, User Name, Email, Amount, Type, Payment Method, Reference, Status
- Data properly quoted (commas in names handled)
- Opens in Excel without issues

#### Test 6.2: Export Members
**Given:** Multiple chamas with members  
**When:** Admin exports members  
**Then:**
- CSV includes all members
- Headers: Member Code, Name, Email, Phone, Chama, Joined Date, Order Index, Status, Is Manager
- Manager status shows as true/false
- Dates in ISO format

#### Test 6.3: Export with Special Characters
**Given:** User names contain commas, quotes  
**When:** CSV exported  
**Then:**
- Special characters properly escaped
- Names wrapped in quotes
- CSV parses correctly

### 7. Integration Tests

#### Test 7.1: Full Admin Workflow
1. Login as admin
2. Navigate to `/admin`
3. View stats overview
4. Click "Advanced Search & Tools"
5. Search for user by email
6. View user's KYC (with ID images)
7. Approve KYC
8. Navigate to Transactions tab
9. Export transactions CSV
10. View audit logs
11. Verify KYC approval logged

#### Test 7.2: Search → KYC → Approve Flow
1. Search user by name
2. Click "View KYC"
3. **View both ID images**
4. Verify information matches
5. Approve
6. Search same user again
7. Verify status changed to "approved"

#### Test 7.3: Search Member → View Chama
1. Search by member code
2. Click "View Chama"
3. Navigate to chama detail page
4. View member in context
5. Check member's payment history

## Edge Cases

### Edge Case 1: Multiple Matching Results
**Scenario:** Search returns 25 results  
**Expected:** Only first 20 displayed per category

### Edge Case 2: Expired Signed URLs
**Scenario:** Admin leaves KYC page open for > 1 hour  
**Expected:** Images may fail to load, refresh page to regenerate

### Edge Case 3: Simultaneous Exports
**Scenario:** Multiple admins export at same time  
**Expected:** Each gets their own CSV, no conflicts

### Edge Case 4: Search Special Characters
**Scenario:** Search query contains % or _  
**Expected:** Properly escaped, no SQL errors

### Edge Case 5: Large CSV Export
**Scenario:** 10,000+ transactions  
**Expected:** May timeout, consider pagination or date range

## Security Tests

### Security Test 1: Non-Admin Access
**Given:** User without admin role  
**When:** Attempts to access `/admin/dashboard`  
**Then:**
- Redirected to home or access denied
- Edge functions return 403 Forbidden

### Security Test 2: API Without Auth Token
**Given:** Request to admin-search without Authorization header  
**When:** POST request sent  
**Then:**
- Returns 401 Unauthorized
- No data leaked

### Security Test 3: SQL Injection Attempt
**Given:** Search query contains SQL injection  
**When:** Admin performs search  
**Then:**
- Query properly parameterized
- No database errors
- No data breach

### Security Test 4: Audit Log Immutability
**Given:** Audit logs exist  
**When:** Admin tries to modify/delete logs  
**Then:**
- RLS prevents modification
- Only SELECT allowed
- Logs remain intact

## Performance Tests

### Performance Test 1: Search Response Time
**Given:** Large database (10,000+ users)  
**When:** Admin performs search  
**Then:**
- Results return within 2 seconds
- Limited to 20 per category
- No timeout errors

### Performance Test 2: CSV Export Time
**Given:** 1,000 transactions  
**When:** Admin exports CSV  
**Then:**
- Export completes within 10 seconds
- File downloads successfully
- No memory issues

### Performance Test 3: Concurrent Admin Users
**Given:** 5 admins using dashboard  
**When:** All perform searches simultaneously  
**Then:**
- No conflicts
- Each gets correct results
- No performance degradation

## Success Criteria

✅ Admin can search by name, phone, ID, member code, mchango slug, transaction ID  
✅ **ID images display correctly** during KYC verification  
✅ ID images are clickable to enlarge  
✅ Search returns full history for entities  
✅ KYC approval/rejection works with images visible  
✅ Transactions table displays all data correctly  
✅ CSV export works for transactions and members  
✅ Audit logs track all admin actions  
✅ Account adjustment creates audit trail  
✅ All admin functions require admin role  
✅ Signed URLs work for private ID documents  

## Demo Flow

### Complete Admin Panel Demo:

1. **Setup**:
   - Create admin user account
   - Assign admin role
   - Login as admin

2. **Search Users**:
   - Navigate to `/admin/dashboard`
   - Search "Declark" with type "User"
   - View results showing user info

3. **KYC Verification**:
   - From search results, click "View KYC"
   - **Verify ID images display** (both front and back)
   - Click image to enlarge
   - Verify details match
   - Click "Approve"

4. **Search Member Code**:
   - Search "tech-savers-M005"
   - View member details
   - Click "View Chama"
   - See member in chama context

5. **Search Mchango**:
   - Search "donate-for-school"
   - View mchango details
   - Check donation history

6. **Transaction Management**:
   - Switch to Transactions tab
   - View recent transactions
   - Click "Export CSV"
   - Verify CSV downloads and opens

7. **Account Adjustment**:
   - Switch to Account Adjustment tab
   - Enter user ID
   - Select "Credit"
   - Amount: KES 1000
   - Reason: "Test credit for early user"
   - Submit
   - Verify success

8. **Audit Trail**:
   - Switch to Audit Logs tab
   - Verify account adjustment logged
   - Check KYC approval logged
   - Verify timestamps and user IDs

9. **Export Members**:
   - (Future) Export members CSV
   - Verify all member data included

## API Tests

### Test Admin Search API
```bash
POST /functions/v1/admin-search
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "query": "john",
  "type": "user"
}

# Expected Response:
{
  "data": {
    "users": [{
      "id": "uuid",
      "full_name": "John Doe",
      "email": "john@example.com",
      "phone": "+254712345678",
      "kyc_status": "approved"
    }],
    "members": [],
    "mchangos": [],
    "chamas": [],
    "transactions": []
  }
}
```

### Test Admin Export API
```bash
POST /functions/v1/admin-export
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "type": "transactions"
}

# Expected Response:
{
  "csv": "ID,Date,User Name,Email,Amount,Type,Payment Method,Reference,Status\nabc,2025-01-15,John Doe,john@example.com,1000,donation,mpesa,MPX123,completed\n"
}
```

### Test Member Dashboard API (with commission)
```bash
GET /functions/v1/member-dashboard?chama_id={chama_id}
Authorization: Bearer {member_token}

# Expected Response includes:
{
  "data": {
    "chama": {
      "commission_rate": 0.05
    }
  }
}
```

## Database Verification

### Verify Admin Role
```sql
SELECT 
  ur.user_id,
  ur.role,
  p.full_name,
  p.email
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin';
```

### Verify Audit Logs Created
```sql
SELECT 
  action,
  table_name,
  user_id,
  created_at,
  new_values
FROM audit_logs
WHERE action = 'UPDATE'
AND table_name = 'transactions'
ORDER BY created_at DESC
LIMIT 10;
```

### Verify Manual Adjustment
```sql
SELECT 
  id,
  user_id,
  amount,
  transaction_type,
  payment_method,
  payment_reference,
  status,
  created_at
FROM transactions
WHERE payment_method = 'manual_adjustment'
ORDER BY created_at DESC;
```

### Check KYC Image Paths
```sql
SELECT 
  id,
  full_name,
  id_front_url,
  id_back_url,
  kyc_status
FROM profiles
WHERE kyc_submitted_at IS NOT NULL
AND kyc_status = 'pending'
LIMIT 5;
```

## UI Tests

### UI Test 1: Search Bar
- Dropdown shows all search types
- Input placeholder changes based on type
- Clear button (X) appears when typing
- Search button disables when empty

### UI Test 2: Search Results Cards
- Each entity type has own card
- Results are grouped and labeled
- Action buttons clearly visible
- Badges use correct colors

### UI Test 3: KYC Image Display
- Images display side-by-side on desktop
- Stack vertically on mobile
- Hover shows pointer cursor
- Loading state shows "Loading..."
- Error state shows "No image uploaded"

### UI Test 4: Tables
- Headers clearly labeled
- Rows alternate colors
- Scrollable when > 10 rows
- Export button visible and accessible

### UI Test 5: Tabs
- All tabs accessible
- Active tab highlighted
- Content switches without page reload
- State persists during session

## Error Handling Tests

### Error Test 1: Network Failure
**Given:** Network connection lost  
**When:** Admin performs search  
**Then:**
- Error toast appears
- Clear error message
- Can retry when connection restored

### Error Test 2: Invalid User ID
**Given:** Admin enters non-UUID in adjustment  
**When:** Form submitted  
**Then:**
- Validation error or API error
- Clear message to user
- Form remains filled (don't clear)

### Error Test 3: Missing Admin Role
**Given:** User without admin role  
**When:** Accessing admin endpoints  
**Then:**
- 403 Forbidden response
- Redirect to home page
- Error message displayed

## Acceptance Checklist

✅ Admin can search users by name, phone, ID number  
✅ Admin can search member codes and see full member history  
✅ Admin can search mchango slugs and view campaigns  
✅ Admin can search transaction IDs and see details  
✅ **Admin can see KYC ID images (front and back)** during verification  
✅ **ID images are clickable to enlarge**  
✅ KYC approval/rejection works correctly  
✅ Transactions table displays with all data  
✅ CSV export works for transactions  
✅ CSV export works for members  
✅ Audit logs track all admin actions  
✅ Account adjustment creates transactions and audit entries  
✅ All features require admin role  
✅ UI is responsive and accessible  
✅ Error handling is graceful  

## Notes

### ID Image Display Fix
The original issue where admins couldn't see ID images has been fixed by:
1. Extracting path from full storage URL
2. Using `createSignedUrl()` with correct path
3. Setting 1-hour expiry on signed URLs
4. Proper error handling for missing images

### Commission Display Integration
All admin views show commission calculations:
- Mchango: 15% commission
- Chama: 5% commission (or custom rate)
- Net balances displayed everywhere

### Search Limits
- 20 results per category (users, members, mchangos, etc.)
- Can be adjusted in edge function
- Prevents timeout on large datasets

### CSV Export Limits
- Currently exports all records
- Consider adding date range filter for large datasets
- May implement pagination in future

### Security
- All endpoints require admin role
- RLS policies enforce data access
- Audit logs are immutable
- IP addresses tracked for accountability
