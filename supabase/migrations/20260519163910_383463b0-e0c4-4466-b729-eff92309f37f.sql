CREATE TABLE IF NOT EXISTS public.paybill_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcode text NOT NULL,
  working_account numeric,
  utility_account numeric,
  charges_paid_account numeric,
  merchant_account numeric,
  organization_settlement_account numeric,
  raw_result jsonb,
  conversation_id text,
  originator_conversation_id text,
  result_code integer,
  result_desc text,
  queried_by uuid,
  queried_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paybill_balance_queried_at ON public.paybill_balance_snapshots (queried_at DESC);
CREATE INDEX IF NOT EXISTS idx_paybill_balance_conversation ON public.paybill_balance_snapshots (conversation_id);

ALTER TABLE public.paybill_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view paybill balance snapshots"
ON public.paybill_balance_snapshots
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert paybill balance snapshots"
ON public.paybill_balance_snapshots
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));