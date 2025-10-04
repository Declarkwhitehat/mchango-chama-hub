-- Add RLS policy for admins to view all chamas
CREATE POLICY "Admins can view all chamas"
ON public.chama
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add RLS policy for admins to view all chama members
CREATE POLICY "Admins can view all chama members"
ON public.chama_members
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));