-- Allow users to view their own roles to avoid bootstrap issues when checking admin status
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);