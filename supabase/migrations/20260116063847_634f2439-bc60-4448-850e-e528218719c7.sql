-- Drop the existing restrictive insert policy
DROP POLICY IF EXISTS "Anyone can create donations" ON public.organization_donations;

-- Create a new policy that allows anyone to insert donations
-- Guests can insert with user_id = NULL
-- Logged-in users must set user_id to their own ID or NULL
CREATE POLICY "Anyone can create donations" ON public.organization_donations
FOR INSERT
WITH CHECK (
  user_id IS NULL 
  OR user_id = auth.uid()
);