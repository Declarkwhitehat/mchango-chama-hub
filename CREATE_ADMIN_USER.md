# Creating Admin Users

## Overview
Admin users have special privileges to review KYC submissions, manage users, and access administrative functions.

## How to Create an Admin User

### Step 1: Sign Up Normally
1. Go to `/auth` and sign up with email and password
2. Complete your profile

### Step 2: Add Admin Role to Database
Once you have a user account, you need to manually add the admin role to the `user_roles` table.

**Method 1: Using Backend Dashboard**
1. Click on "View Backend" button to open the Lovable Cloud dashboard
2. Navigate to Table Editor → user_roles
3. Click "Insert row"
4. Fill in:
   - `user_id`: Your user UUID (from profiles table)
   - `role`: Select "admin"
5. Click "Save"

**Method 2: Using SQL**
Run this SQL query in the SQL Editor (replace the UUID with your actual user ID):

```sql
-- Get your user ID first
SELECT id, email, full_name FROM profiles WHERE email = 'your-email@example.com';

-- Insert admin role (replace the UUID with your user ID from above)
INSERT INTO public.user_roles (user_id, role)
VALUES ('your-user-uuid-here', 'admin');
```

### Step 3: Verify Admin Access
1. Log out and log back in
2. Navigate to `/admin` - you should see the admin dashboard
3. Navigate to `/admin/kyc` - you should see KYC review queue

## Admin Capabilities

Once you have admin role, you can:

### 1. Review KYC Submissions
- **URL**: `/admin/kyc`
- **Functions**:
  - View all pending KYC submissions
  - Review ID documents (front and back)
  - Approve or reject submissions
  - Provide rejection reasons

### 2. Access Admin Dashboard
- **URL**: `/admin`
- **Features**:
  - View user statistics
  - Monitor active campaigns
  - Track active groups
  - See total funds raised
  - Quick access to KYC review

## Troubleshooting

### Can't Access Admin Pages
**Problem**: Getting "Access denied" error or redirected to home

**Solution**:
1. Verify admin role exists in database:
```sql
SELECT * FROM user_roles WHERE user_id = 'your-user-id' AND role = 'admin';
```

2. Check if you're logged in:
   - Try logging out and logging back in
   - Clear browser cache
   - Check console for errors

### KYC Submissions Not Showing
**Problem**: Admin can access page but no submissions appear

**Possible Causes**:
1. **No submissions yet**: No users have submitted KYC documents
2. **RLS Policy Issue**: Admin might not have proper permissions

**Solution**:
1. Create a test KYC submission:
   - Sign up with a different account
   - Go to `/kyc-upload`
   - Upload ID documents

2. Check RLS policies:
```sql
-- Verify admin can see all profiles
SELECT * FROM profiles WHERE kyc_submitted_at IS NOT NULL;
```

3. Check for console errors in browser developer tools

### Profile Data Not Loading
**Problem**: User data shows as blank or null

**Solution**:
Make sure the profiles table has data:
```sql
-- Check your profile
SELECT * FROM profiles WHERE id = auth.uid();

-- Check all profiles with KYC submissions
SELECT id, full_name, email, kyc_status, kyc_submitted_at 
FROM profiles 
WHERE kyc_submitted_at IS NOT NULL;
```

## Testing Admin Functionality

### Test KYC Review Flow
1. **Create Test User**:
   - Sign up with test email
   - Upload test ID documents at `/kyc-upload`

2. **Review as Admin**:
   - Log in as admin
   - Go to `/admin/kyc`
   - Click "Review" on submission
   - Test both "Approve" and "Reject" functions

3. **Verify Changes**:
   - Check that status updates correctly
   - Verify rejection reason is saved
   - Confirm approval allows user to create mchangos

### Verify RLS Policies
Run these queries to ensure proper access:

```sql
-- As admin, should see all profiles
SELECT COUNT(*) FROM profiles;

-- As admin, should be able to update profiles
UPDATE profiles 
SET kyc_status = 'approved' 
WHERE id = 'test-user-id';

-- As regular user, should only see own profile
-- (Test by running query as non-admin user)
SELECT * FROM profiles;
```

## Security Notes

⚠️ **IMPORTANT**: 
- Admin role grants significant privileges
- Only give admin access to trusted users
- Regularly audit admin users:
  ```sql
  SELECT u.email, r.role, r.created_at
  FROM user_roles r
  JOIN auth.users u ON u.id = r.user_id
  WHERE r.role = 'admin';
  ```

## Common Admin Tasks

### Approve Multiple KYC Submissions
```sql
-- Approve all pending submissions (use with caution!)
UPDATE profiles 
SET kyc_status = 'approved',
    kyc_reviewed_at = NOW(),
    kyc_reviewed_by = 'your-admin-user-id'
WHERE kyc_status = 'pending';
```

### Reset KYC Status
```sql
-- Reset a user's KYC to resubmit
UPDATE profiles 
SET kyc_status = 'pending',
    kyc_rejection_reason = NULL,
    kyc_reviewed_at = NULL,
    kyc_reviewed_by = NULL
WHERE id = 'user-id-here';
```

### Remove Admin Access
```sql
-- Remove admin role from a user
DELETE FROM user_roles 
WHERE user_id = 'user-id-here' 
AND role = 'admin';
```

## Next Steps

After setting up your admin account:
1. Test the KYC review process
2. Set up additional admin users if needed
3. Configure admin notifications (future feature)
4. Review and approve legitimate KYC submissions
5. Monitor platform activity regularly

## Support

For issues or questions:
- Check console logs in browser developer tools
- Review error messages in the backend logs
- Check RLS policies and permissions
- Verify database schema is up to date
