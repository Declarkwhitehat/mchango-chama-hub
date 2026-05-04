CREATE TABLE IF NOT EXISTS public.chama_grace_reminders_sent (
  member_id UUID NOT NULL,
  cycle_id UUID NOT NULL,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, cycle_id, reminder_type)
);

ALTER TABLE public.chama_grace_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages grace reminders"
ON public.chama_grace_reminders_sent
FOR ALL
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_grace_reminders_cycle ON public.chama_grace_reminders_sent(cycle_id);