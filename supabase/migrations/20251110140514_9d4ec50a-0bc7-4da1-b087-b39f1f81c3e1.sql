-- Drop the problematic RLS policy that causes infinite recursion
DROP POLICY IF EXISTS "Members can view group members" ON public.saving_group_members;

-- Create a new policy that doesn't cause recursion
-- Allow users to view members of groups they belong to
CREATE POLICY "Members can view group members"
ON public.saving_group_members
FOR SELECT
USING (
  -- Admins can see all
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Users can see their own membership
  user_id = auth.uid()
  OR
  -- Managers can see all members in their groups
  EXISTS (
    SELECT 1 FROM public.saving_groups
    WHERE saving_groups.id = saving_group_members.group_id
    AND saving_groups.manager_id = auth.uid()
  )
);