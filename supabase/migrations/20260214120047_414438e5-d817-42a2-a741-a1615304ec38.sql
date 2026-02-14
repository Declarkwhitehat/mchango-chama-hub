
-- Add mpesa_receipt_number column to all payment tables
ALTER TABLE public.contributions ADD COLUMN IF NOT EXISTS mpesa_receipt_number text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS mpesa_receipt_number text;
ALTER TABLE public.mchango_donations ADD COLUMN IF NOT EXISTS mpesa_receipt_number text;
ALTER TABLE public.organization_donations ADD COLUMN IF NOT EXISTS mpesa_receipt_number text;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_contributions_mpesa_receipt ON public.contributions(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_mpesa_receipt ON public.transactions(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mchango_donations_mpesa_receipt ON public.mchango_donations(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_donations_mpesa_receipt ON public.organization_donations(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;
