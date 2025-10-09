-- Add order_index to chama_members
ALTER TABLE public.chama_members 
  ADD COLUMN IF NOT EXISTS order_index integer,
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Create invite_codes table
CREATE TABLE IF NOT EXISTS public.chama_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id uuid NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT now(),
  used_by uuid REFERENCES public.profiles(id),
  used_at timestamp with time zone,
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone
);

-- Enable RLS on invite_codes
ALTER TABLE public.chama_invite_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for invite_codes
CREATE POLICY "Managers can create invite codes"
ON public.chama_invite_codes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_id = chama_invite_codes.chama_id
    AND user_id = auth.uid()
    AND is_manager = true
    AND status = 'active'
  )
);

CREATE POLICY "Managers can view their chama's invite codes"
ON public.chama_invite_codes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_id = chama_invite_codes.chama_id
    AND user_id = auth.uid()
    AND is_manager = true
    AND status = 'active'
  )
);

CREATE POLICY "Anyone can view active codes to validate"
ON public.chama_invite_codes
FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Managers can update invite codes"
ON public.chama_invite_codes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_id = chama_invite_codes.chama_id
    AND user_id = auth.uid()
    AND is_manager = true
    AND status = 'active'
  )
);

-- Update chama_members RLS policies for privacy
DROP POLICY IF EXISTS "Users can view members of their chamas" ON public.chama_members;
CREATE POLICY "Only chama members can view member details"
ON public.chama_members
FOR SELECT
USING (
  user_id = auth.uid() 
  OR 
  EXISTS (
    SELECT 1 FROM public.chama_members cm
    WHERE cm.chama_id = chama_members.chama_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND cm.approval_status = 'approved'
  )
);

-- Update chama_members insert policy to allow pending joins
DROP POLICY IF EXISTS "Chama creators can insert members" ON public.chama_members;
CREATE POLICY "Users can join chama with invite code"
ON public.chama_members
FOR INSERT
WITH CHECK (
  -- User is joining themselves
  auth.uid() = user_id
  AND
  -- Valid invite code exists
  EXISTS (
    SELECT 1 FROM public.chama_invite_codes
    WHERE chama_id = chama_members.chama_id
    AND is_active = true
    AND used_by IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  )
);

-- Allow managers to approve members
CREATE POLICY "Managers can approve members"
ON public.chama_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members cm
    WHERE cm.chama_id = chama_members.chama_id
    AND cm.user_id = auth.uid()
    AND cm.is_manager = true
    AND cm.status = 'active'
    AND cm.approval_status = 'approved'
  )
);

-- Function to generate unique member code
CREATE OR REPLACE FUNCTION public.generate_member_code(p_chama_id uuid, p_order_index integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_code text;
BEGIN
  -- Get chama slug
  SELECT slug INTO v_slug FROM chama WHERE id = p_chama_id;
  
  -- Generate code format: SLUG-M### (e.g., tech-savers-M005)
  v_code := substring(v_slug from 1 for 10) || '-M' || LPAD(p_order_index::text, 3, '0');
  
  RETURN v_code;
END;
$$;

-- Function to generate random invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    -- Generate 8-character alphanumeric code
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM chama_invite_codes WHERE code = v_code) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invite_codes_chama ON public.chama_invite_codes(chama_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON public.chama_invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_active ON public.chama_invite_codes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chama_members_order ON public.chama_members(chama_id, order_index);