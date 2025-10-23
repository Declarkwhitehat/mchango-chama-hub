-- Allow everyone (including unauthenticated users) to view all active mchangos
DROP POLICY IF EXISTS "Public can view public active mchangos" ON public.mchango;

CREATE POLICY "Public can view active mchangos"
ON public.mchango
FOR SELECT
USING (status = 'active');