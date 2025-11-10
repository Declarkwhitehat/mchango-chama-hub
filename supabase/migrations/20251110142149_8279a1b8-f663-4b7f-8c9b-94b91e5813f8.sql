-- Add period_months column to saving_groups table
ALTER TABLE public.saving_groups 
ADD COLUMN period_months integer NOT NULL DEFAULT 6 
CHECK (period_months >= 6 AND period_months <= 24);