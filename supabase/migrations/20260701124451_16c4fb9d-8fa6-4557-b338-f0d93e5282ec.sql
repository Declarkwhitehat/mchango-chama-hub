
CREATE TABLE IF NOT EXISTS public.mchango_expiry_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mchango(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h','final')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, reminder_type)
);

GRANT SELECT ON public.mchango_expiry_reminders_sent TO authenticated;
GRANT ALL ON public.mchango_expiry_reminders_sent TO service_role;

ALTER TABLE public.mchango_expiry_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages expiry reminders"
  ON public.mchango_expiry_reminders_sent
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_mchango_expiry_reminders_campaign
  ON public.mchango_expiry_reminders_sent(campaign_id);
