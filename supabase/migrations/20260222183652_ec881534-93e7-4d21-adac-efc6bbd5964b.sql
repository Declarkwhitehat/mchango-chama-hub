
-- Create table to store TOTP secrets for 2FA
CREATE TABLE public.totp_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;

-- Users can view their own TOTP config
CREATE POLICY "Users can view own totp" ON public.totp_secrets
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own TOTP config
CREATE POLICY "Users can insert own totp" ON public.totp_secrets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own TOTP config
CREATE POLICY "Users can update own totp" ON public.totp_secrets
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own TOTP config
CREATE POLICY "Users can delete own totp" ON public.totp_secrets
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all totp" ON public.totp_secrets
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
