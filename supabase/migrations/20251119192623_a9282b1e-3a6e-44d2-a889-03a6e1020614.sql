-- Create table to store WebAuthn credentials
CREATE TABLE public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Users can view their own credentials
CREATE POLICY "Users can view their own webauthn credentials"
ON public.webauthn_credentials
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own credentials
CREATE POLICY "Users can insert their own webauthn credentials"
ON public.webauthn_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own credentials
CREATE POLICY "Users can delete their own webauthn credentials"
ON public.webauthn_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for efficient lookups
CREATE INDEX idx_webauthn_user_id ON public.webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_credential_id ON public.webauthn_credentials(credential_id);

-- Add comment
COMMENT ON TABLE public.webauthn_credentials IS 'Stores WebAuthn credentials for biometric/fingerprint authentication';