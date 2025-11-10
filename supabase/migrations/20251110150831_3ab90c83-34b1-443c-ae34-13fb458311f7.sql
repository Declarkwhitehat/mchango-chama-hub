-- Create saving_group_invite_codes table
CREATE TABLE IF NOT EXISTS public.saving_group_invite_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  saving_group_id UUID NOT NULL REFERENCES public.saving_groups(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create function to generate unique invite codes
CREATE OR REPLACE FUNCTION public.generate_group_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8-character alphanumeric code
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM saving_group_invite_codes WHERE code = v_code) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Enable RLS
ALTER TABLE public.saving_group_invite_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Managers can create invite codes"
ON public.saving_group_invite_codes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM saving_groups
    WHERE id = saving_group_id
    AND manager_id = auth.uid()
  )
);

CREATE POLICY "Managers can view their group invite codes"
ON public.saving_group_invite_codes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM saving_groups
    WHERE id = saving_group_id
    AND manager_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view active codes for validation"
ON public.saving_group_invite_codes
FOR SELECT
TO authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Managers can delete invite codes"
ON public.saving_group_invite_codes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM saving_groups
    WHERE id = saving_group_id
    AND manager_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all invite codes"
ON public.saving_group_invite_codes
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can update invite codes"
ON public.saving_group_invite_codes
FOR UPDATE
TO authenticated
USING (true);