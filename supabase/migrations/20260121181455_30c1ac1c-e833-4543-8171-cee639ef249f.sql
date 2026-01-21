-- Allow anyone to view completed donations for public donors list
-- This enables the donors list to be displayed on organization detail pages
CREATE POLICY "Anyone can view completed donations for public display"
ON public.organization_donations
FOR SELECT
USING (payment_status = 'completed');