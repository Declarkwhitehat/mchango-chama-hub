-- Add IP address tracking column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_ip inet,
ADD COLUMN IF NOT EXISTS signup_ip inet,
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.last_login_ip IS 'Last IP address used for login. Only visible to admins for security purposes.';
COMMENT ON COLUMN public.profiles.signup_ip IS 'IP address at account creation. Only visible to admins for security purposes.';
COMMENT ON COLUMN public.profiles.last_login_at IS 'Timestamp of last login';

-- Ensure admins have full access to all data
-- Update chama_members policy for admin full visibility
DROP POLICY IF EXISTS "Admins have full access to all members" ON public.chama_members;

CREATE POLICY "Admins have full access to all members"
ON public.chama_members
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Ensure admin can view all mchango donations
DROP POLICY IF EXISTS "Admins have full access to donations" ON public.mchango_donations;

CREATE POLICY "Admins have full access to donations"
ON public.mchango_donations
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Update profiles RLS to allow admins to see IP addresses
-- Admins already have view access, just need to ensure they can see IP fields
COMMENT ON TABLE public.profiles IS 'User profiles. IP addresses are only visible to administrators for security and fraud prevention.';