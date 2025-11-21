-- Drop the restrictive policy that requires KYC approval
DROP POLICY IF EXISTS "Verified users can view active public chamas" ON public.chama;

-- Create a simple policy allowing anyone to view active public chamas
CREATE POLICY "Anyone can view active public chamas"
ON public.chama
FOR SELECT
USING (status = 'active' AND is_public = true);