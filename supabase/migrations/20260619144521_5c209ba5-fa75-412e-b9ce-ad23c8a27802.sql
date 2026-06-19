CREATE TABLE IF NOT EXISTS public.kyc_reminders_sent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket SMALLINT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bucket)
);
GRANT ALL ON public.kyc_reminders_sent TO service_role;
ALTER TABLE public.kyc_reminders_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.kyc_reminders_sent FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_kyc_reminders_user ON public.kyc_reminders_sent(user_id);