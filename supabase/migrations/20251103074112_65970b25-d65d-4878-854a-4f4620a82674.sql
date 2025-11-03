-- Drop the old admin-only delete policy
DROP POLICY IF EXISTS "Admins can delete invite codes" ON public.chama_invite_codes;

-- Create new policy allowing managers to delete their chama's invite codes
CREATE POLICY "Managers and admins can delete invite codes"
ON public.chama_invite_codes
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_members.chama_id = chama_invite_codes.chama_id
    AND chama_members.user_id = auth.uid()
    AND chama_members.is_manager = true
    AND chama_members.status = 'active'
    AND chama_members.approval_status = 'approved'
  )
);