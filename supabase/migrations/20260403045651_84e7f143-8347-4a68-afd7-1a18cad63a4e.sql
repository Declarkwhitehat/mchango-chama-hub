
-- Add cooling_off_until column to track the 24-hour waiting period for welfare withdrawals
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS cooling_off_until timestamptz;

-- Add index for efficient cron lookups
CREATE INDEX IF NOT EXISTS idx_withdrawals_cooling_off ON public.withdrawals (cooling_off_until) 
WHERE status = 'approved' AND cooling_off_until IS NOT NULL AND welfare_id IS NOT NULL;
