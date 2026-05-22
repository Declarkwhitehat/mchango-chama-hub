DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='member_cycle_payments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.member_cycle_payments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='payouts') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payouts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chama_overpayment_wallet') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chama_overpayment_wallet';
  END IF;
END$$;

ALTER TABLE public.member_cycle_payments REPLICA IDENTITY FULL;
ALTER TABLE public.payouts REPLICA IDENTITY FULL;
ALTER TABLE public.chama_overpayment_wallet REPLICA IDENTITY FULL;