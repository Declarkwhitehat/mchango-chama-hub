-- Add SELECT policy for savings group creators and managers
CREATE POLICY "Creators and managers can view their savings groups"
ON public.saving_groups
FOR SELECT
USING (
  auth.uid() = created_by 
  OR auth.uid() = manager_id
);