
CREATE POLICY "Donors can update their own pending donations"
ON public.mchango_donations
FOR UPDATE
TO anon, authenticated
USING (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
)
WITH CHECK (
  (auth.uid() IS NULL AND user_id IS NULL)
  OR
  (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

GRANT UPDATE ON public.mchango_donations TO anon;
