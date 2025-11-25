
-- Fix profiles RLS policy to allow managers to view pending member profiles
-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Managers can view member profiles in their chamas" ON public.profiles;

-- Create new policy that includes pending members
CREATE POLICY "Managers can view member profiles in their chamas including pending"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM chama_members cm_manager
    JOIN chama_members cm_member ON cm_manager.chama_id = cm_member.chama_id
    WHERE cm_manager.user_id = auth.uid()
    AND cm_manager.is_manager = true
    AND cm_manager.approval_status = 'approved'
    AND cm_member.user_id = profiles.id
    -- Allow viewing pending, approved, and rejected members
  )
);
