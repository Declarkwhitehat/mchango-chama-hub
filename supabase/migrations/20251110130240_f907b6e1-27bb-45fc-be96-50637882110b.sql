-- Add admin policies for savings groups
CREATE POLICY "Admins can view all savings groups"
ON public.saving_groups
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update savings groups"
ON public.saving_groups
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for savings group members
CREATE POLICY "Admins can view all savings group members"
ON public.saving_group_members
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update savings group members"
ON public.saving_group_members
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for savings group deposits
CREATE POLICY "Admins can view all savings group deposits"
ON public.saving_group_deposits
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for saving_deposits (alternative table)
CREATE POLICY "Admins can view all saving deposits"
ON public.saving_deposits
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role));