-- Update RLS policy for chama table to allow only verified users to view chamas
DROP POLICY IF EXISTS "Anyone can view active chamas" ON public.chama;

CREATE POLICY "Verified users can view active public chamas"
ON public.chama
FOR SELECT
USING (
  status = 'active'
  AND is_public = true
  AND (
    auth.uid() IS NULL -- Allow unauthenticated for public pages
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND kyc_status = 'approved'
    )
  )
);

-- Update chama_members RLS to allow all members to view pending requests
DROP POLICY IF EXISTS "Only chama members can view member details" ON public.chama_members;

CREATE POLICY "Chama members can view all member details including pending"
ON public.chama_members
FOR SELECT
USING (
  -- User can view their own membership
  user_id = auth.uid()
  OR 
  -- Approved members can view all members (including pending)
  EXISTS (
    SELECT 1 FROM public.chama_members cm
    WHERE cm.chama_id = chama_members.chama_id
    AND cm.user_id = auth.uid()
    AND cm.approval_status = 'approved'
  )
  OR
  -- Managers can view all members
  is_chama_manager(auth.uid(), chama_id)
);

-- Ensure managers can update member approval status
DROP POLICY IF EXISTS "Managers can update member approval status" ON public.chama_members;

CREATE POLICY "Managers can update member approval status"
ON public.chama_members
FOR UPDATE
USING (is_chama_manager(auth.uid(), chama_id))
WITH CHECK (is_chama_manager(auth.uid(), chama_id));