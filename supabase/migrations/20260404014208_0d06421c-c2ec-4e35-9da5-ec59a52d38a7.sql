-- Update is_chama_member to include approved members with inactive status
-- This allows newly approved members to see their chama before first payment
CREATE OR REPLACE FUNCTION public.is_chama_member(_user_id uuid, _chama_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chama_members cm
    WHERE cm.chama_id = _chama_id
      AND cm.user_id = _user_id
      AND cm.approval_status = 'approved'
      AND cm.status IN ('active', 'inactive')
  );
$$;