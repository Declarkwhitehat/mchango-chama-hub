-- ============================================
-- Fix 1: Donor PII Exposure in mchango_donations
-- ============================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Verified users can view donations for active mchangos" ON mchango_donations;

-- Create restricted policy - only creator, donor, and admins can see full details
CREATE POLICY "Limited donation data access"
ON mchango_donations FOR SELECT
USING (
  -- Allow full access to campaign creator, donor, and admins
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM mchango 
    WHERE id = mchango_donations.mchango_id 
    AND created_by = auth.uid()
  )
);

-- Create public view without PII for displaying donations
CREATE OR REPLACE VIEW public_donations AS
SELECT 
  id,
  mchango_id,
  amount,
  created_at,
  completed_at,
  payment_status,
  CASE 
    WHEN is_anonymous THEN 'Anonymous'
    ELSE COALESCE(display_name, 'Anonymous')
  END as display_name
FROM mchango_donations
WHERE payment_status = 'completed';

-- Grant SELECT on view to authenticated users
GRANT SELECT ON public_donations TO authenticated;

-- ============================================
-- Fix 2: Verify RLS helper functions exist and are correct
-- ============================================

-- Ensure is_chama_member function exists (should already exist)
CREATE OR REPLACE FUNCTION public.is_chama_member(_user_id uuid, _chama_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

-- Ensure is_chama_manager function exists (should already exist)
CREATE OR REPLACE FUNCTION public.is_chama_manager(_user_id uuid, _chama_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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