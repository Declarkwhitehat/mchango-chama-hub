-- Allow admins to insert and delete user_roles
CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
USING (
  has_role(auth.uid(), 'admin')
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
);