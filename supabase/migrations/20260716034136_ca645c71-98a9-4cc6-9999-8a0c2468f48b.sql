DELETE FROM public.financial_ledger
WHERE source_type = 'welfare'
  AND reference_id IS NULL
  AND description = 'Offline welfare contribution (registration fee 10%, contributions 5%)';