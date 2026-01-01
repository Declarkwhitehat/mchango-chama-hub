-- Drop the existing policy that may not work correctly for anonymous users
DROP POLICY IF EXISTS "Anyone can create donations" ON mchango_donations;

-- Create a new policy that explicitly allows guest donations
-- The key is using a simple check that works with the anon role
CREATE POLICY "Anyone can create donations" ON mchango_donations
  FOR INSERT
  WITH CHECK (
    -- Guest donations: user_id must be NULL
    (user_id IS NULL)
    OR
    -- Authenticated donations: user_id must match the logged-in user
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
  );

-- Grant INSERT permission to anon role explicitly
GRANT INSERT ON mchango_donations TO anon;