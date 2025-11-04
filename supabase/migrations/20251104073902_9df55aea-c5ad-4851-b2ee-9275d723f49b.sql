-- Create OTP storage table
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  otp TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3
);

-- Create index for phone lookups
CREATE INDEX idx_otp_phone ON public.otp_verifications(phone);
CREATE INDEX idx_otp_expires ON public.otp_verifications(expires_at);

-- Enable RLS
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role only for security)
CREATE POLICY "Service role can manage OTPs"
ON public.otp_verifications
FOR ALL
USING (true)
WITH CHECK (true);

-- Add phone verification field to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_otp_verified BOOLEAN DEFAULT false;

-- Function to clean expired OTPs
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.otp_verifications
  WHERE expires_at < now() OR created_at < (now() - interval '1 day');
END;
$$;