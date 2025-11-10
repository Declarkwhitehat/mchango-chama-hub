-- Create security definer function to check KYC without RLS recursion
CREATE OR REPLACE FUNCTION public.check_kyc_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND (kyc_status::text = 'approved')
  );
$$;

-- Replace INSERT policy on saving_groups to use the function
DROP POLICY IF EXISTS "Verified users can create groups" ON public.saving_groups;

CREATE POLICY "Verified users can create groups"
ON public.saving_groups
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND public.check_kyc_approved(auth.uid())
);
