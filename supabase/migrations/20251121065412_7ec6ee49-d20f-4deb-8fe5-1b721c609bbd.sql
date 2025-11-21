-- Migration to fix duplicate phone numbers and add unique constraint

-- Step 1: Make phone column nullable (it currently has NOT NULL constraint)
ALTER TABLE profiles ALTER COLUMN phone DROP NOT NULL;

-- Step 2: Resolve duplicates by keeping the most recent account
-- For +254717790986
UPDATE profiles 
SET phone = NULL, updated_at = now()
WHERE phone = '+254717790986' 
AND id NOT IN (
  SELECT id FROM profiles 
  WHERE phone = '+254717790986' 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- For +254794944611
UPDATE profiles 
SET phone = NULL, updated_at = now()
WHERE phone = '+254794944611' 
AND id NOT IN (
  SELECT id FROM profiles 
  WHERE phone = '+254794944611' 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- For +254793885941
UPDATE profiles 
SET phone = NULL, updated_at = now()
WHERE phone = '+254793885941' 
AND id NOT IN (
  SELECT id FROM profiles 
  WHERE phone = '+254793885941' 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- Step 3: Add unique constraint on phone column (allows NULLs, but duplicates are not allowed)
ALTER TABLE profiles ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);