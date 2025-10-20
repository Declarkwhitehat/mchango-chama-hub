-- Update RLS policy to allow users to create pending memberships without invite codes
DROP POLICY IF EXISTS "Users can join chama with invite code" ON chama_members;

CREATE POLICY "Users can request to join chama"
ON chama_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND approval_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM chama 
    WHERE chama.id = chama_members.chama_id 
    AND chama.is_public = true
    AND chama.status = 'active'
  )
);
