-- Fix infinite recursion in saving_groups RLS policies
-- Create SECURITY DEFINER function to break recursion chain

-- 1. Create security definer function to check if user is savings group manager
CREATE OR REPLACE FUNCTION public.is_savings_group_manager(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.saving_groups sg
    WHERE sg.id = _group_id
      AND sg.manager_id = _user_id
  );
$$;

-- 2. Drop the problematic policy on profiles
DROP POLICY IF EXISTS "Managers can view member profiles in savings groups including pending" ON public.profiles;

-- 3. Create new policy using the security definer function
CREATE POLICY "Managers can view member profiles in savings groups including pending"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM saving_group_members sgm
    WHERE sgm.user_id = profiles.id
    AND is_savings_group_manager(auth.uid(), sgm.group_id)
  )
);