-- Add missing policy: creators should always see their own mchangos
CREATE POLICY "Creators can view their own mchangos"
ON public.mchango
FOR SELECT
USING (auth.uid() = created_by);
