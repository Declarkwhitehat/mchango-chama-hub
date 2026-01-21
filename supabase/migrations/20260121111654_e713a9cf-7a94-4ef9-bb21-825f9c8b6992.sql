-- Add B2C tracking columns to withdrawals table
ALTER TABLE public.withdrawals 
ADD COLUMN IF NOT EXISTS b2c_attempt_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_b2c_attempt_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS b2c_error_details JSONB;

-- Add index for retry queries
CREATE INDEX IF NOT EXISTS idx_withdrawals_b2c_retry 
ON public.withdrawals (status, b2c_attempt_count, last_b2c_attempt_at) 
WHERE status IN ('failed', 'pending_retry', 'processing');

-- Comment for documentation
COMMENT ON COLUMN public.withdrawals.b2c_attempt_count IS 'Number of B2C payout attempts made';
COMMENT ON COLUMN public.withdrawals.last_b2c_attempt_at IS 'Timestamp of last B2C attempt';
COMMENT ON COLUMN public.withdrawals.b2c_error_details IS 'JSON details of B2C errors for debugging';