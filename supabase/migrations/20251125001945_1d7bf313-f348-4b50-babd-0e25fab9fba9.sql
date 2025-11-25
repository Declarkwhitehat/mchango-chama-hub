-- Fix Savings Group RLS policies for pending member approval flow

-- 1. Update saving_group_members RLS policy to allow managers to see pending members
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
  -- Managers can view all members in their groups (including pending)
  (
    EXISTS (
      SELECT 1
      FROM saving_groups sg
      WHERE sg.id = saving_group_members.group_id
      AND sg.manager_id = auth.uid()
    )
  )
);

-- 2. Add policy for managers to view pending member profiles in savings groups
CREATE POLICY "Managers can view member profiles in savings groups including pending"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM saving_groups sg
    JOIN saving_group_members sgm ON sg.id = sgm.group_id
    WHERE sg.manager_id = auth.uid()
    AND sgm.user_id = profiles.id
    -- No filter on is_approved - managers can see all members
  )
);