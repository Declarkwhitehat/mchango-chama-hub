CREATE POLICY "Authenticated users can insert earnings"
ON public.company_earnings
FOR INSERT
TO authenticated
WITH CHECK (true);