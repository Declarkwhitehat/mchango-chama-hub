
-- Drop the existing policy that only allows viewing approved members' profiles
DROP POLICY IF EXISTS "Chama members can view fellow member profiles" ON profiles;

-- Create updated policy: managers can see profiles of ALL members (including pending),
-- approved members can see profiles of other approved members
CREATE POLICY "Chama members can view fellow member profiles"
ON profiles FOR SELECT
USING (
  (auth.uid() IS NOT NULL) AND (
    EXISTS (
      SELECT 1
      FROM chama_members cm_viewer
      JOIN chama_members cm_target ON cm_viewer.chama_id = cm_target.chama_id
      WHERE cm_viewer.user_id = auth.uid()
        AND cm_viewer.approval_status = 'approved'
        AND cm_target.user_id = profiles.id
        AND (
          -- Managers can see all members' profiles (including pending)
          cm_viewer.is_manager = true
          -- Non-managers can only see approved members' profiles
          OR cm_target.approval_status = 'approved'
        )
    )
  )
);
