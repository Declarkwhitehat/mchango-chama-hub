-- Fix infinite recursion in saving_group_members RLS policy
-- Update policy to use the security definer function

DROP POLICY IF EXISTS "Members can view group members including pending" ON public.saving_group_members;

CREATE POLICY "Members can view group members including pending"
ON public.saving_group_members
FOR SELECT
USING (
  -- Admins can view all
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Users can view their own membership
  (user_id = auth.uid())
  OR
  -- Managers can view all members in their groups (using security definer function)
  is_savings_group_manager(auth.uid(), group_id)
);