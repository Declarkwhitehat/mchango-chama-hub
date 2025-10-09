-- Update contribution_frequency enum to support every_n_days
ALTER TYPE contribution_frequency ADD VALUE IF NOT EXISTS 'every_n_days';

-- Add new fields to chama table
ALTER TABLE public.chama 
  ADD COLUMN IF NOT EXISTS min_members integer DEFAULT 5 CHECK (min_members >= 5),
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS payout_order text DEFAULT 'join_date' CHECK (payout_order IN ('join_date', 'manager_override')),
  ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0.05 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  ADD COLUMN IF NOT EXISTS every_n_days_count integer CHECK (every_n_days_count > 0);

-- Update max_members constraint
ALTER TABLE public.chama DROP CONSTRAINT IF EXISTS chama_max_members_check;
ALTER TABLE public.chama ADD CONSTRAINT chama_max_members_check CHECK (max_members >= min_members AND max_members <= 100);

-- Update RLS policy for chama creation to require KYC approval
DROP POLICY IF EXISTS "Users can create their own chamas" ON public.chama;
CREATE POLICY "KYC approved users can create chamas" 
ON public.chama 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND kyc_status = 'approved'
  )
);

-- Function to add creator as manager when chama is created
CREATE OR REPLACE FUNCTION public.add_creator_as_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_code_val text;
BEGIN
  -- Generate unique member code (e.g., CHAMA001-M001)
  member_code_val := substring(NEW.slug from 1 for 10) || '-M001';
  
  -- Insert creator as first member and manager
  INSERT INTO public.chama_members (
    chama_id,
    user_id,
    is_manager,
    member_code,
    status
  ) VALUES (
    NEW.id,
    NEW.created_by,
    true,
    member_code_val,
    'active'
  );
  
  RETURN NEW;
END;
$$;

-- Trigger to automatically add creator as manager
DROP TRIGGER IF EXISTS on_chama_created ON public.chama;
CREATE TRIGGER on_chama_created
  AFTER INSERT ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.add_creator_as_manager();