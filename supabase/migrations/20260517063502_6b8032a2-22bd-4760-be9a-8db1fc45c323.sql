
CREATE TABLE IF NOT EXISTS public.chama_late_payment_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  missed_cycle_id UUID REFERENCES public.contribution_cycles(id) ON DELETE SET NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  mpesa_receipt TEXT,
  contribution_id UUID REFERENCES public.contributions(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','consumed_by_debt','cancelled')),
  applied_to_cycle_id UUID REFERENCES public.contribution_cycles(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_late_buffer_receipt_unique
  ON public.chama_late_payment_buffer (mpesa_receipt)
  WHERE mpesa_receipt IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_late_buffer_chama_status
  ON public.chama_late_payment_buffer (chama_id, status);

CREATE INDEX IF NOT EXISTS idx_late_buffer_member_status
  ON public.chama_late_payment_buffer (member_id, status);

ALTER TABLE public.chama_late_payment_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own late buffer"
ON public.chama_late_payment_buffer FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members cm
    WHERE cm.id = chama_late_payment_buffer.member_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Creators view chama late buffer"
ON public.chama_late_payment_buffer FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama c
    WHERE c.id = chama_late_payment_buffer.chama_id
      AND c.created_by = auth.uid()
  )
);

CREATE POLICY "Admins view all late buffer"
ON public.chama_late_payment_buffer FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_late_buffer_updated_at
BEFORE UPDATE ON public.chama_late_payment_buffer
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
