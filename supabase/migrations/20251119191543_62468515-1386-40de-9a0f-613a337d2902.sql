-- Create enum for rate limit identifier types
CREATE TYPE public.rate_limit_type AS ENUM ('ip', 'phone', 'email');

-- Create rate_limit_attempts table
CREATE TABLE public.rate_limit_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  identifier_type rate_limit_type NOT NULL,
  action TEXT NOT NULL, -- 'forgot_password', 'login', etc.
  attempts INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(identifier, identifier_type, action)
);

-- Enable RLS
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limit_attempts
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for efficient lookups
CREATE INDEX idx_rate_limit_lookup ON public.rate_limit_attempts(identifier, identifier_type, action);

-- Create function to clean up old rate limit records (older than 4 hours)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts
  WHERE window_start < (now() - interval '4 hours');
END;
$$;

-- Add comment
COMMENT ON TABLE public.rate_limit_attempts IS 'Tracks rate limiting attempts for various actions to prevent abuse';