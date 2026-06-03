CREATE UNIQUE INDEX IF NOT EXISTS unique_welfare_contributions_payment_reference
ON public.welfare_contributions (payment_reference)
WHERE payment_reference IS NOT NULL;