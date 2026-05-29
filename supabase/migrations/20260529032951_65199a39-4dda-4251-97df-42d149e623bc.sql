-- Track per-cycle payout shortfalls so late payments can top-up shortchanged beneficiaries via B2C
CREATE TABLE IF NOT EXISTS public.chama_payout_shortfalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id uuid NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  beneficiary_member_id uuid NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  shortfall_amount numeric NOT NULL CHECK (shortfall_amount >= 0),
  settled_amount numeric NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','settled')),
  last_b2c_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_chama_payout_shortfalls_chama_status
  ON public.chama_payout_shortfalls(chama_id, status, created_at);

GRANT SELECT ON public.chama_payout_shortfalls TO authenticated;
GRANT ALL ON public.chama_payout_shortfalls TO service_role;

ALTER TABLE public.chama_payout_shortfalls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their chama shortfalls"
  ON public.chama_payout_shortfalls FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chama_members cm
      WHERE cm.chama_id = chama_payout_shortfalls.chama_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

CREATE TRIGGER update_chama_payout_shortfalls_updated_at
  BEFORE UPDATE ON public.chama_payout_shortfalls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic claim helper for FIFO settlement of an inbound late net amount.
-- Returns the row that was updated (or none) so the caller can route a B2C top-up.
CREATE OR REPLACE FUNCTION public.claim_chama_shortfall_for_settlement(
  p_chama_id uuid,
  p_amount numeric
) RETURNS TABLE (
  id uuid,
  cycle_id uuid,
  beneficiary_member_id uuid,
  apply_amount numeric,
  remaining_shortfall numeric,
  fully_settled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_outstanding numeric;
  v_apply numeric;
BEGIN
  SELECT s.id, s.cycle_id, s.beneficiary_member_id, s.shortfall_amount, s.settled_amount
    INTO v_row
    FROM public.chama_payout_shortfalls s
   WHERE s.chama_id = p_chama_id
     AND s.status IN ('pending','partial')
   ORDER BY s.created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND OR p_amount <= 0 THEN
    RETURN;
  END IF;

  v_outstanding := GREATEST(v_row.shortfall_amount - v_row.settled_amount, 0);
  v_apply := LEAST(v_outstanding, p_amount);

  UPDATE public.chama_payout_shortfalls
     SET settled_amount = settled_amount + v_apply,
         status = CASE WHEN settled_amount + v_apply >= shortfall_amount THEN 'settled' ELSE 'partial' END,
         settled_at = CASE WHEN settled_amount + v_apply >= shortfall_amount THEN now() ELSE settled_at END,
         updated_at = now()
   WHERE id = v_row.id;

  id := v_row.id;
  cycle_id := v_row.cycle_id;
  beneficiary_member_id := v_row.beneficiary_member_id;
  apply_amount := v_apply;
  remaining_shortfall := v_outstanding - v_apply;
  fully_settled := (v_outstanding - v_apply) <= 0;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_chama_shortfall_for_settlement(uuid, numeric) TO service_role;