-- Drop old restrictive policies on mchango table
DROP POLICY IF EXISTS "Verified users can view active mchangos" ON public.mchango;

-- Allow any authenticated user to view active public campaigns (no KYC required)
CREATE POLICY "Authenticated users can view public mchangos"
ON public.mchango
FOR SELECT
TO authenticated
USING (
  status = 'active'::mchango_status 
  AND is_public = true
);

-- Allow unauthenticated users to view active public campaigns via shared links
CREATE POLICY "Public can view active public mchangos"
ON public.mchango
FOR SELECT
TO anon
USING (
  status = 'active'::mchango_status 
  AND is_public = true
);

-- Drop old restrictive donation policy
DROP POLICY IF EXISTS "Verified users can create donations" ON public.mchango_donations;

-- Allow both authenticated and guest donations
CREATE POLICY "Anyone can create donations"
ON public.mchango_donations
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- For authenticated users: must be their own donation or null user_id
  (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL))
  OR
  -- For guest donations: user_id must be null
  (auth.uid() IS NULL AND user_id IS NULL)
);