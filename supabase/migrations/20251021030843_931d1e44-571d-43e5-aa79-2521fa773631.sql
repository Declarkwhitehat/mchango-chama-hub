-- Create security definer function to check membership without recursion
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
      AND cm.status = 'active'
  );
$$;

-- Drop the problematic policy on chama
DROP POLICY IF EXISTS "Approved members can view their chama" ON public.chama;

-- Recreate it using the security definer function
CREATE POLICY "Approved members can view their chama"
ON public.chama
FOR SELECT
USING (
  public.is_chama_member(auth.uid(), id)
  OR public.is_chama_manager(auth.uid(), id)
);

-- Drop and recreate the problematic policy on chama_members
DROP POLICY IF EXISTS "Chama members can view all member details including pending" ON public.chama_members;

CREATE POLICY "Chama members can view all member details including pending"
ON public.chama_members
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_chama_member(auth.uid(), chama_id)
  OR public.is_chama_manager(auth.uid(), chama_id)
);
