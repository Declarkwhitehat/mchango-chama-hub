-- Add completed_at column to withdrawals table if it doesn't exist
ALTER TABLE public.withdrawals 
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;