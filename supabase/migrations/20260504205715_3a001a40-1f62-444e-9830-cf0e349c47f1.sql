DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='chama_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chama_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='chama') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chama;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='welfare_members')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='welfare_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.welfare_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='chama_invite_codes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chama_invite_codes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='contribution_cycles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contribution_cycles;
  END IF;
END $$;

ALTER TABLE public.chama_members REPLICA IDENTITY FULL;
ALTER TABLE public.chama REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.chama_invite_codes REPLICA IDENTITY FULL;
ALTER TABLE public.contribution_cycles REPLICA IDENTITY FULL;