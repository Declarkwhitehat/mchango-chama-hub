INSERT INTO public.financial_ledger
  (transaction_type, source_type, source_id, reference_id,
   gross_amount, commission_amount, net_amount, commission_rate,
   description, created_at)
SELECT
  'contribution', 'welfare', wc.welfare_id, wc.id,
  wc.gross_amount, wc.commission_amount, wc.net_amount,
  CASE WHEN wc.gross_amount > 0
       THEN ROUND((wc.commission_amount / wc.gross_amount)::numeric, 4)
       ELSE 0 END,
  CASE WHEN wc.category = 'registration_fee'
       THEN 'Welfare registration fee (backfill)'
       ELSE 'Welfare contribution (backfill)' END,
  COALESCE(wc.completed_at, wc.created_at)
FROM public.welfare_contributions wc
WHERE wc.payment_status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_ledger fl
    WHERE fl.reference_id = wc.id AND fl.source_type = 'welfare'
  );