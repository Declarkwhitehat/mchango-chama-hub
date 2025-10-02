-- Add missing fields to mchango table
ALTER TABLE public.mchango 
  ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS beneficiary_url TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS managers UUID[] DEFAULT ARRAY[]::UUID[];

-- Rename goal_amount to target_amount for consistency
ALTER TABLE public.mchango 
  RENAME COLUMN goal_amount TO target_amount;

-- Add comment for managers field
COMMENT ON COLUMN public.mchango.managers IS 'Array of user IDs who can manage this mchango (creator + up to 2 additional managers)';

-- Create unique index on slug for faster lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mchango_slug ON public.mchango(slug);

-- Add index on is_public for filtering
CREATE INDEX IF NOT EXISTS idx_mchango_is_public ON public.mchango(is_public) WHERE status = 'active';

-- Update RLS policy to only allow KYC-approved users to create mchango
DROP POLICY IF EXISTS "Users can create their own mchangos" ON public.mchango;

CREATE POLICY "KYC approved users can create mchangos"
ON public.mchango
FOR INSERT
WITH CHECK (
  auth.uid() = created_by 
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND kyc_status = 'approved'
  )
);

-- Update RLS policy for public mchangos visibility
DROP POLICY IF EXISTS "Anyone can view active mchangos" ON public.mchango;

CREATE POLICY "Public can view public active mchangos"
ON public.mchango
FOR SELECT
USING (
  status = 'active' 
  AND (is_public = true OR created_by = auth.uid() OR auth.uid() = ANY(managers))
);

-- Policy for managers to update
CREATE POLICY "Managers can update mchango"
ON public.mchango
FOR UPDATE
USING (
  created_by = auth.uid() OR auth.uid() = ANY(managers)
);

-- Add validation trigger for managers array (max 3 total including creator)
CREATE OR REPLACE FUNCTION validate_mchango_managers()
RETURNS TRIGGER AS $$
BEGIN
  -- Check that managers array doesn't exceed 2 additional managers
  IF array_length(NEW.managers, 1) > 2 THEN
    RAISE EXCEPTION 'Maximum of 2 additional managers allowed (plus creator)';
  END IF;
  
  -- Ensure creator is not in managers array
  IF NEW.created_by = ANY(NEW.managers) THEN
    RAISE EXCEPTION 'Creator is automatically a manager and should not be in managers array';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_mchango_managers
  BEFORE INSERT OR UPDATE ON public.mchango
  FOR EACH ROW
  EXECUTE FUNCTION validate_mchango_managers();