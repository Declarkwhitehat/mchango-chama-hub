-- Add DELETE policy for admin on chama table
CREATE POLICY "Admins can delete chamas" 
ON public.chama 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for admin on mchango table
CREATE POLICY "Admins can delete mchangos" 
ON public.mchango 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for admin on organizations table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'organizations' 
    AND policyname = 'Admins can delete organizations'
  ) THEN
    CREATE POLICY "Admins can delete organizations" 
    ON public.organizations 
    FOR DELETE 
    USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Add DELETE policies for related tables that admin needs to clean up

-- contributions table
CREATE POLICY "Admins can delete contributions" 
ON public.contributions 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- chama_members table
CREATE POLICY "Admins can delete chama members" 
ON public.chama_members 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- chama_cycle_history table
CREATE POLICY "Admins can delete chama cycle history" 
ON public.chama_cycle_history 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- mchango_donations table
CREATE POLICY "Admins can delete mchango donations" 
ON public.mchango_donations 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- organization_donations table
CREATE POLICY "Admins can delete organization donations" 
ON public.organization_donations 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));