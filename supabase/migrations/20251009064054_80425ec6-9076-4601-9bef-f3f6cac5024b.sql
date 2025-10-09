-- Fix recursive RLS on chama_members by introducing a SECURITY DEFINER helper and updating policies

-- 1) Create helper function to check if a user is a manager of a chama, avoiding recursive policy lookups
CREATE OR REPLACE FUNCTION public.is_chama_manager(_user_id uuid, _chama_id uuid)
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
      AND cm.is_manager = true
      AND cm.status = 'active'
      AND cm.approval_status = 'approved'
  );
$$;

-- 2) Replace recursive policies on chama_members
-- Drop problematic policies if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chama_members'
      AND policyname = 'Managers can approve members'
  ) THEN
    EXECUTE 'DROP POLICY "Managers can approve members" ON public.chama_members;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chama_members'
      AND policyname = 'Managers can update members'
  ) THEN
    EXECUTE 'DROP POLICY "Managers can update members" ON public.chama_members;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chama_members'
      AND policyname = 'Only chama members can view member details'
  ) THEN
    EXECUTE 'DROP POLICY "Only chama members can view member details" ON public.chama_members;';
  END IF;
END $$;

-- Recreate non-recursive policies using the helper function
-- SELECT: allow users to view their own row or managers to view members of their chama
CREATE POLICY "Only chama members can view member details"
ON public.chama_members
FOR SELECT
USING (
  user_id = auth.uid() OR public.is_chama_manager(auth.uid(), chama_id)
);

-- UPDATE: managers can update members in their chama (covers approval and other updates)
CREATE POLICY "Managers can update members"
ON public.chama_members
FOR UPDATE
USING (
  public.is_chama_manager(auth.uid(), chama_id)
);

-- Keep existing INSERT policy as-is (non-recursive) allowing users to join via valid invite code
-- No changes needed here
