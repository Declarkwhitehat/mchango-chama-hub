ALTER TYPE public.contribution_frequency ADD VALUE IF NOT EXISTS 'twice_weekly';

ALTER TABLE public.chama
  ADD COLUMN IF NOT EXISTS weekly_contribution_day smallint,
  ADD COLUMN IF NOT EXISTS weekly_contribution_day_2 smallint;

ALTER TABLE public.chama
  DROP CONSTRAINT IF EXISTS chama_weekly_days_valid;

ALTER TABLE public.chama
  ADD CONSTRAINT chama_weekly_days_valid CHECK (
    (weekly_contribution_day IS NULL OR (weekly_contribution_day >= 0 AND weekly_contribution_day <= 6))
    AND (weekly_contribution_day_2 IS NULL OR (weekly_contribution_day_2 >= 0 AND weekly_contribution_day_2 <= 6))
    AND (
      weekly_contribution_day IS NULL
      OR weekly_contribution_day_2 IS NULL
      OR weekly_contribution_day <> weekly_contribution_day_2
    )
  );