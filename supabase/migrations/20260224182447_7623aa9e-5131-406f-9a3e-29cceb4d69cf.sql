
-- Add 'twice_monthly' to the contribution_frequency enum
ALTER TYPE contribution_frequency ADD VALUE IF NOT EXISTS 'twice_monthly';

-- Store which day(s) of the month contributions are due (1-28)
ALTER TABLE public.chama ADD COLUMN IF NOT EXISTS monthly_contribution_day INTEGER DEFAULT NULL;
ALTER TABLE public.chama ADD COLUMN IF NOT EXISTS monthly_contribution_day_2 INTEGER DEFAULT NULL;
