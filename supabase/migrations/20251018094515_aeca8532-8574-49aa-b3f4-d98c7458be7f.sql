-- Drop the old policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Creators can view their own chamas" ON public.chama;

-- Allow creators to always view their own chamas (even if private or inactive)
CREATE POLICY "Creators can view their own chamas"
ON public.chama
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);