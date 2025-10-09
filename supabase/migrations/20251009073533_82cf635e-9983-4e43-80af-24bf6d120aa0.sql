-- Add balance tracking fields to chama_members table
ALTER TABLE public.chama_members
ADD COLUMN IF NOT EXISTS balance_credit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_deficit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_payment_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS next_due_date timestamp with time zone;

-- Add payment cycle tracking
CREATE TABLE IF NOT EXISTS public.contribution_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id uuid NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  due_amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(chama_id, cycle_number)
);

-- Add payment status tracking per cycle per member
CREATE TABLE IF NOT EXISTS public.member_cycle_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.chama_members(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  amount_paid numeric DEFAULT 0,
  amount_due numeric NOT NULL,
  is_paid boolean DEFAULT false,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(member_id, cycle_id)
);

-- Enable RLS on new tables
ALTER TABLE public.contribution_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_cycle_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for contribution_cycles
CREATE POLICY "Members can view cycles for their chamas"
ON public.contribution_cycles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_members.chama_id = contribution_cycles.chama_id
    AND chama_members.user_id = auth.uid()
    AND chama_members.approval_status = 'approved'
  )
);

CREATE POLICY "Managers can create cycles"
ON public.contribution_cycles
FOR INSERT
WITH CHECK (
  is_chama_manager(auth.uid(), chama_id)
);

-- RLS policies for member_cycle_payments
CREATE POLICY "Members can view their own cycle payments"
ON public.member_cycle_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_members.id = member_cycle_payments.member_id
    AND chama_members.user_id = auth.uid()
  )
);

CREATE POLICY "Members can insert their own payments"
ON public.member_cycle_payments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_members.id = member_cycle_payments.member_id
    AND chama_members.user_id = auth.uid()
  )
);

CREATE POLICY "Managers can view all payments in their chamas"
ON public.member_cycle_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members cm
    JOIN public.contribution_cycles cc ON cc.id = member_cycle_payments.cycle_id
    WHERE cm.chama_id = cc.chama_id
    AND cm.user_id = auth.uid()
    AND cm.is_manager = true
  )
);

-- Function to calculate next due date based on contribution frequency
CREATE OR REPLACE FUNCTION public.calculate_next_due_date(
  p_chama_id uuid,
  p_last_payment_date timestamp with time zone
) RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_frequency text;
  v_every_n_days integer;
  v_next_date timestamp with time zone;
BEGIN
  SELECT contribution_frequency, every_n_days_count
  INTO v_frequency, v_every_n_days
  FROM chama
  WHERE id = p_chama_id;

  CASE v_frequency
    WHEN 'daily' THEN
      v_next_date := p_last_payment_date + interval '1 day';
    WHEN 'weekly' THEN
      v_next_date := p_last_payment_date + interval '7 days';
    WHEN 'monthly' THEN
      v_next_date := p_last_payment_date + interval '1 month';
    WHEN 'every_n_days' THEN
      v_next_date := p_last_payment_date + (v_every_n_days || ' days')::interval;
    ELSE
      v_next_date := p_last_payment_date + interval '7 days';
  END CASE;

  RETURN v_next_date;
END;
$$;

-- Function to calculate payout schedule
CREATE OR REPLACE FUNCTION public.get_member_payout_position(
  p_member_id uuid
) RETURNS TABLE (
  position_in_queue integer,
  estimated_payout_date timestamp with time zone,
  estimated_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chama_id uuid;
  v_order_index integer;
  v_contribution_amount numeric;
  v_joined_at timestamp with time zone;
  v_approved_member_count integer;
BEGIN
  -- Get member info
  SELECT chama_id, order_index, joined_at
  INTO v_chama_id, v_order_index, v_joined_at
  FROM chama_members
  WHERE id = p_member_id;

  -- Get chama contribution amount and approved member count
  SELECT c.contribution_amount, COUNT(cm.id)
  INTO v_contribution_amount, v_approved_member_count
  FROM chama c
  LEFT JOIN chama_members cm ON cm.chama_id = c.id AND cm.approval_status = 'approved'
  WHERE c.id = v_chama_id
  GROUP BY c.id, c.contribution_amount;

  RETURN QUERY
  SELECT
    v_order_index::integer as position_in_queue,
    calculate_next_due_date(v_chama_id, v_joined_at + ((v_order_index - 1) * interval '7 days')) as estimated_payout_date,
    (v_contribution_amount * v_approved_member_count)::numeric as estimated_amount;
END;
$$;