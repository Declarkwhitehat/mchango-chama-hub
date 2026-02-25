
-- Allow admins to delete totp_secrets (for 2FA reset)
CREATE POLICY "Admins can delete totp" ON public.totp_secrets
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
