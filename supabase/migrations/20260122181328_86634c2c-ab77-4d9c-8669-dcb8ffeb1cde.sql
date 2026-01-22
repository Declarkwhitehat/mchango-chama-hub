-- Drop the restrictive manager-only policy
DROP POLICY IF EXISTS "Managers can view member profiles in their chamas including pen" ON public.profiles;

-- Create a new policy that allows all approved chama members to view each other's profiles
CREATE POLICY "Chama members can view fellow member profiles"
ON public.profiles FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM chama_members cm_viewer
    JOIN chama_members cm_target ON cm_viewer.chama_id = cm_target.chama_id
    WHERE cm_viewer.user_id = auth.uid()
      AND cm_viewer.approval_status = 'approved'
      AND cm_target.user_id = profiles.id
      AND cm_target.approval_status = 'approved'
  )
);