ALTER TABLE public.mchango REPLICA IDENTITY FULL;
ALTER TABLE public.mchango_donations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mchango;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mchango_donations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;