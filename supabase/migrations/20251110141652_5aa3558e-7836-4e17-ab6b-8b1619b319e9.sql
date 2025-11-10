-- Fix recursion: simplify saving_group_members SELECT policy to avoid referencing saving_groups
BEGIN;

DROP POLICY IF EXISTS "Members can view group members" ON public.saving_group_members;

CREATE POLICY "Members can view group members"
ON public.saving_group_members
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);

COMMIT;