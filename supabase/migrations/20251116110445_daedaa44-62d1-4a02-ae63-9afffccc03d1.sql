-- Create user_consents table to track T&C and privacy policy acceptance
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL DEFAULT 'v1.0',
  privacy_version TEXT NOT NULL DEFAULT 'v1.0',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Users can view their own consent records
CREATE POLICY "Users can view their own consents"
  ON public.user_consents
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert consent records (during signup)
CREATE POLICY "Service can insert consents"
  ON public.user_consents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all consents
CREATE POLICY "Admins can view all consents"
  ON public.user_consents
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_accepted_at ON public.user_consents(accepted_at);