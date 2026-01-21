-- Allow admins to update any payment method (for payment change requests)
CREATE POLICY "Admins can update all payment methods"
  ON public.payment_methods
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));