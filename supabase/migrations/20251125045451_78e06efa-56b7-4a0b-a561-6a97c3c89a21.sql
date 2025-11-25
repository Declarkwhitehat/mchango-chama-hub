-- Fix RLS policy on saving_group_invite_codes to allow anonymous validation
DROP POLICY IF EXISTS "Anyone can view active codes for validation" ON public.saving_group_invite_codes;

-- Create new policy allowing both authenticated and anonymous users to validate active codes
CREATE POLICY "Anyone can view active codes for validation"
ON public.saving_group_invite_codes
FOR SELECT
TO anon, authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));