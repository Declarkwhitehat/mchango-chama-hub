# Admin Setup & Testing Guide

## 🚀 Quick Start

### Step 1: Create Your Admin Account

1. **Sign Up**
   - Go to your app (landing page)
   - Click "Sign Up" in the header
   - Fill in all required details:
     - Full Name
     - Email
     - Password
     - ID Number
     - Phone Number
   - Click "Sign Up"

2. **Make Yourself Admin**

   **Option A: Using Backend Dashboard (Easiest)**
   ```
   1. Click "View Backend" button (will be provided)
   2. Navigate to: Table Editor → user_roles
   3. Click "Insert row"
   4. Fill in:
      - user_id: [Your user ID from profiles table]
      - role: admin
   5. Save
   ```

   **Option B: Using SQL (Quick)**
   ```sql
   -- First, find your user ID
   SELECT id, email, full_name 
   FROM profiles 
   WHERE email = 'your-email@example.com';
   
   -- Then, make yourself admin (replace the UUID)
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('your-user-uuid-here', 'admin');
   ```

3. **Log Out and Log Back In**
   - This ensures your session picks up the new admin role
   - You should now see "Admin Dashboard" option

### Step 2: Test Admin Access

1. **Access Admin Dashboard**
   - Navigate to: `/admin`
   - You should see:
     - User statistics
     - Campaign stats
     - "Review KYC Submissions" button

2. **Access KYC Review**
   - Navigate to: `/admin/kyc`
   - You should see:
     - List of KYC submissions
     - Review button for each submission
     - Approve/Reject functionality

### Step 3: Create Test KYC Submission

To test the admin KYC review functionality:

1. **Create Second Test Account**
   - Open incognito/private browser window
   - Sign up with different email
   - Complete profile

2. **Submit KYC Documents**
   - Go to `/kyc-upload`
   - Upload ID front and back images
   - Submit

3. **Review as Admin**
   - Switch back to your admin account
   - Go to `/admin/kyc`
   - You should see the new submission
   - Click "Review" to see details
   - Test "Approve" and "Reject" buttons

## ✅ Features Implemented

### Landing Page
- ✅ **Professional Header Navigation**
  - Fixed header with logo
  - Login button (with icon)
  - Sign Up button (with icon)
  - Mobile-responsive menu
  
- ✅ **Enhanced Footer**
  - Copyright information
  - "Website created by Declark Chacha" credit

### Admin Dashboard (`/admin`)
- ✅ Statistics Cards:
  - Total Users
  - Active Campaigns
  - Active Groups
  - Funds Raised
  
- ✅ Quick Actions:
  - Review KYC Submissions button
  - Manage Users (placeholder)
  - View Reports (placeholder)
  
- ✅ Tabbed Interface:
  - Recent Users tab
  - Recent Campaigns tab
  - Chama Groups tab

- ✅ **Admin Access Control**:
  - Automatic role verification
  - Redirect to home if not admin
  - Error messages for access issues

### KYC Review Dashboard (`/admin/kyc`)
- ✅ **Submission List View**:
  - All KYC submissions with status badges
  - Submission dates
  - Quick review button
  
- ✅ **Detailed Review View**:
  - User information display
  - ID document viewer (front & back)
  - Approve button (green)
  - Reject button (red)
  - Rejection reason text area
  
- ✅ **Review Actions**:
  - Approve KYC (updates status to 'approved')
  - Reject KYC (requires reason)
  - Saves reviewer ID and timestamp
  - Success/error notifications

- ✅ **Security**:
  - Admin-only access
  - Role verification on page load
  - Proper error handling
  - Console logging for debugging

## 🔧 Troubleshooting

### Problem: "Access denied: Admin privileges required"

**Cause**: User doesn't have admin role in database

**Solution**:
```sql
-- Check if you have admin role
SELECT * FROM user_roles 
WHERE user_id = 'your-user-id' AND role = 'admin';

-- If not, add it
INSERT INTO user_roles (user_id, role)
VALUES ('your-user-id', 'admin');
```

### Problem: KYC submissions not showing

**Cause 1**: No submissions yet
- Create a test submission (see Step 3 above)

**Cause 2**: RLS policy issue
```sql
-- Check if admin can see profiles
SELECT COUNT(*) FROM profiles WHERE kyc_submitted_at IS NOT NULL;

-- If returns 0 but you know there are submissions, contact support
```

**Cause 3**: Database connection issue
- Check browser console for errors
- Verify you're logged in
- Try refreshing the page

### Problem: Can't approve/reject submissions

**Cause**: Database update permissions

**Solution**:
```sql
-- Verify RLS policies allow updates
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

### Problem: Images not loading

**Cause**: Storage bucket permissions

**Solution**:
- Check if images exist in storage bucket
- Verify storage bucket policies
- Check browser console for 404 errors

## 📊 Testing Checklist

### Admin Access
- [ ] Can access `/admin` without errors
- [ ] Can see statistics dashboard
- [ ] Can access `/admin/kyc` without errors
- [ ] Can see KYC submissions list

### KYC Review
- [ ] Can view submission details
- [ ] Can see ID document images
- [ ] Can approve submission
- [ ] Can reject submission with reason
- [ ] Status updates correctly
- [ ] Gets success notification
- [ ] Submission disappears from pending list after action

### User Experience
- [ ] Header navigation works on all pages
- [ ] Login/Signup buttons redirect correctly
- [ ] Mobile menu works on small screens
- [ ] Footer displays creator credit
- [ ] All links work correctly

## 🎯 Next Steps

After confirming admin functionality works:

1. **Approve Legitimate Users**
   - Review actual KYC submissions
   - Approve verified users
   - Reject suspicious submissions with reasons

2. **Monitor Platform**
   - Check stats regularly
   - Review new campaigns
   - Monitor user activity

3. **Scale Admin Team** (if needed)
   ```sql
   -- Add more admin users
   INSERT INTO user_roles (user_id, role)
   VALUES ('other-user-uuid', 'admin');
   ```

4. **Customize Admin Dashboard**
   - Add more statistics
   - Create custom reports
   - Add filtering options

## 📝 SQL Helper Queries

### View All Admins
```sql
SELECT 
  p.email,
  p.full_name,
  r.created_at as admin_since
FROM user_roles r
JOIN profiles p ON p.id = r.user_id
WHERE r.role = 'admin';
```

### View All KYC Stats
```sql
SELECT 
  kyc_status,
  COUNT(*) as count
FROM profiles
WHERE kyc_submitted_at IS NOT NULL
GROUP BY kyc_status;
```

### Recent KYC Activity
```sql
SELECT 
  full_name,
  email,
  kyc_status,
  kyc_submitted_at,
  kyc_reviewed_at
FROM profiles
WHERE kyc_submitted_at IS NOT NULL
ORDER BY kyc_submitted_at DESC
LIMIT 10;
```

### Approve All Pending (Use with caution!)
```sql
UPDATE profiles
SET 
  kyc_status = 'approved',
  kyc_reviewed_at = NOW(),
  kyc_reviewed_by = 'your-admin-user-id'
WHERE kyc_status = 'pending';
```

## 🆘 Support

If you encounter issues:

1. **Check Console Logs**
   - Browser console (F12)
   - Look for red error messages
   - Note any failed API calls

2. **Check Backend Logs**
   - Open backend dashboard
   - Go to Logs section
   - Filter for errors

3. **Verify Data**
   ```sql
   -- Check your admin status
   SELECT * FROM user_roles WHERE user_id = auth.uid();
   
   -- Check KYC submissions
   SELECT COUNT(*) FROM profiles WHERE kyc_submitted_at IS NOT NULL;
   ```

4. **Common Fixes**
   - Clear browser cache
   - Log out and log back in
   - Verify database schema is up to date
   - Check RLS policies are configured

## ✨ Features Summary

Your admin system now includes:

✅ **Professional Landing Page**
- Fixed header with login/signup
- Mobile-responsive navigation
- Creator credit in footer

✅ **Secure Admin Access**
- Role-based authentication
- Automatic access verification
- Proper error handling

✅ **Full KYC Review System**
- List all submissions
- View submission details
- See ID documents
- Approve/Reject with reasons
- Status tracking
- Reviewer audit trail

✅ **User-Friendly Interface**
- Clean, modern design
- Intuitive navigation
- Responsive layout
- Status badges
- Action buttons with icons

Everything is ready to use! Just follow the setup steps above to make yourself an admin and start reviewing KYC submissions. 🚀
