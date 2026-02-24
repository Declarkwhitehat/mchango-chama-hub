
-- Add organization_id column to withdrawals table
ALTER TABLE public.withdrawals 
ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Create index for organization withdrawal queries
CREATE INDEX idx_withdrawals_organization_id ON public.withdrawals(organization_id) WHERE organization_id IS NOT NULL;

-- Add RLS policy for organization creators to request withdrawals
CREATE POLICY "Org creators can request withdrawals"
ON public.withdrawals
FOR INSERT
WITH CHECK (
  auth.uid() = requested_by 
  AND organization_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = withdrawals.organization_id 
    AND organizations.created_by = auth.uid()
  )
);

-- Add RLS policy for org creators to view their withdrawals
CREATE POLICY "Org creators can view their org withdrawals"
ON public.withdrawals
FOR SELECT
USING (
  organization_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = withdrawals.organization_id 
    AND organizations.created_by = auth.uid()
  )
);

-- Create atomic balance update function for organizations
CREATE OR REPLACE FUNCTION public.update_organization_withdrawn(p_organization_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE organizations
  SET 
    current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_amount),
    available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount)
  WHERE id = p_organization_id;
END;
$$;
