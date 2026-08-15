ALTER TABLE public.chama
  ADD CONSTRAINT chama_monthly_days_valid CHECK (
    (monthly_contribution_day IS NULL OR (monthly_contribution_day >= 1 AND monthly_contribution_day <= 28))
    AND (monthly_contribution_day_2 IS NULL OR (monthly_contribution_day_2 >= 1 AND monthly_contribution_day_2 <= 28))
    AND (monthly_contribution_day IS NULL OR monthly_contribution_day_2 IS NULL OR monthly_contribution_day <> monthly_contribution_day_2)
  );

ALTER TABLE public.chama
  ADD CONSTRAINT chama_frequency_days_complete CHECK (
    (contribution_frequency <> 'twice_monthly'::contribution_frequency
      OR (monthly_contribution_day IS NOT NULL AND monthly_contribution_day_2 IS NOT NULL))
    AND (contribution_frequency <> 'twice_weekly'::contribution_frequency
      OR (weekly_contribution_day IS NOT NULL AND weekly_contribution_day_2 IS NOT NULL))
  ) NOT VALID;