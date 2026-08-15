UPDATE public.chama
SET contribution_frequency = 'twice_weekly',
    every_n_days_count = NULL,
    weekly_contribution_day = 1,
    weekly_contribution_day_2 = 5,
    updated_at = now()
WHERE id = '83496ca2-4c1b-44c5-b9a3-dfbc05a4bc50';