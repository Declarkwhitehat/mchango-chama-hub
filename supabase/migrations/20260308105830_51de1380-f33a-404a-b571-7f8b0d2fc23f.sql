ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS check_chama_or_mchango;

ALTER TABLE public.withdrawals ADD CONSTRAINT check_entity_source CHECK (
  (
    (chama_id IS NOT NULL)::int +
    (mchango_id IS NOT NULL)::int +
    (organization_id IS NOT NULL)::int +
    (welfare_id IS NOT NULL)::int
  ) = 1
);