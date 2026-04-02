CREATE POLICY "Welfare members can view fellow member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM welfare_members wm_viewer
    JOIN welfare_members wm_target ON wm_viewer.welfare_id = wm_target.welfare_id
    WHERE wm_viewer.user_id = auth.uid()
      AND wm_target.user_id = profiles.id
      AND wm_viewer.status = 'active'
      AND wm_target.status = 'active'
  )
);