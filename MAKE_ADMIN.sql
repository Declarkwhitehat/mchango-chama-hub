-- ============================================
-- MAKE USER ADMIN
-- ============================================
-- This script grants admin privileges to a user
-- Replace 'your-email@example.com' with your actual email

-- STEP 1: Find your user ID
-- Run this first to get your user ID
SELECT 
  id,
  email,
  full_name,
  kyc_status,
  created_at
FROM profiles
WHERE email = 'your-email@example.com';

-- STEP 2: Insert admin role
-- Copy the 'id' from step 1 and replace 'YOUR-USER-ID-HERE' below
INSERT INTO public.user_roles (user_id, role)
VALUES ('YOUR-USER-ID-HERE', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- STEP 3: Verify admin role was created
SELECT 
  r.id,
  r.user_id,
  r.role,
  p.email,
  p.full_name,
  r.created_at
FROM user_roles r
JOIN profiles p ON p.id = r.user_id
WHERE r.role = 'admin';

-- ============================================
-- ALTERNATIVE: Make the first user admin
-- ============================================
-- If you're the first/only user, uncomment and run this:
-- 
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin'::app_role
-- FROM profiles
-- ORDER BY created_at ASC
-- LIMIT 1
-- ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================
-- VERIFY EVERYTHING IS WORKING
-- ============================================

-- Check all admin users
SELECT 
  p.id,
  p.email,
  p.full_name,
  r.role,
  r.created_at as admin_since
FROM user_roles r
JOIN profiles p ON p.id = r.user_id
WHERE r.role = 'admin'
ORDER BY r.created_at;

-- Check KYC submissions that admin should see
SELECT 
  id,
  full_name,
  email,
  kyc_status,
  kyc_submitted_at,
  created_at
FROM profiles
WHERE kyc_submitted_at IS NOT NULL
ORDER BY kyc_submitted_at DESC;

-- ============================================
-- TROUBLESHOOTING
-- ============================================

-- If admin still can't see KYC submissions, check RLS policies:
-- This should return policies for the profiles table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Remove admin role (if needed)
-- DELETE FROM user_roles WHERE user_id = 'YOUR-USER-ID' AND role = 'admin';
