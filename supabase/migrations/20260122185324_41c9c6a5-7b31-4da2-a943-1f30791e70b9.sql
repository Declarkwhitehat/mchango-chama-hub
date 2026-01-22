-- Add financial tracking columns to chama table
ALTER TABLE public.chama 
ADD COLUMN IF NOT EXISTS total_gross_collected NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_commission_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS available_balance NUMERIC DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.chama.total_gross_collected IS 'Total amount collected from all contributions (gross)';
COMMENT ON COLUMN public.chama.total_commission_paid IS 'Total platform commission deducted (5% default)';
COMMENT ON COLUMN public.chama.available_balance IS 'Net amount available for withdrawal (gross - commission - withdrawn)';