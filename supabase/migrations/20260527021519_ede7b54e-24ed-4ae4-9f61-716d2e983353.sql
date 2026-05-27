
-- 1. welfares: registration fee + dual-approval change request
ALTER TABLE public.welfares
  ADD COLUMN IF NOT EXISTS registration_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_fee_pending numeric,
  ADD COLUMN IF NOT EXISTS registration_fee_change_requested_by uuid,
  ADD COLUMN IF NOT EXISTS registration_fee_change_requested_at timestamptz;

-- 2. welfare_members: per-member registration tracking
ALTER TABLE public.welfare_members
  ADD COLUMN IF NOT EXISTS registration_fee_due numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_fee_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS registration_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS registration_last_reminder_at timestamptz;

-- Backfill existing members
UPDATE public.welfare_members
   SET registration_status = 'confirmed'
 WHERE registration_status IS NULL OR registration_status = '';

-- 3. welfare_contributions: distinguish registration payments
ALTER TABLE public.welfare_contributions
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'contribution';

-- 4. Credit ledger for forfeited partial fees
CREATE TABLE IF NOT EXISTS public.welfare_registration_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welfare_id uuid NOT NULL REFERENCES public.welfares(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_member_id uuid
);
CREATE INDEX IF NOT EXISTS idx_wrc_user_welfare_open
  ON public.welfare_registration_credits (welfare_id, user_id) WHERE consumed_at IS NULL;

GRANT SELECT ON public.welfare_registration_credits TO authenticated;
GRANT ALL ON public.welfare_registration_credits TO service_role;
ALTER TABLE public.welfare_registration_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own registration credits"
  ON public.welfare_registration_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Auto-apply available credit on join/rejoin
CREATE OR REPLACE FUNCTION public.apply_welfare_registration_credit_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit record;
  v_remaining numeric;
BEGIN
  IF NEW.registration_status NOT IN ('pending','partial') OR COALESCE(NEW.registration_fee_due,0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_credit
    FROM public.welfare_registration_credits
   WHERE welfare_id = NEW.welfare_id
     AND user_id    = NEW.user_id
     AND consumed_at IS NULL
   ORDER BY created_at
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  NEW.registration_fee_paid := LEAST(v_credit.amount, NEW.registration_fee_due);
  v_remaining := NEW.registration_fee_due - NEW.registration_fee_paid;

  IF v_remaining <= 0 THEN
    NEW.registration_status := 'confirmed';
  ELSE
    NEW.registration_status := 'partial';
  END IF;

  UPDATE public.welfare_registration_credits
     SET consumed_at = now(), consumed_member_id = NEW.id
   WHERE id = v_credit.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_welfare_registration_credit ON public.welfare_members;
CREATE TRIGGER trg_apply_welfare_registration_credit
BEFORE INSERT OR UPDATE OF registration_status, registration_fee_due ON public.welfare_members
FOR EACH ROW EXECUTE FUNCTION public.apply_welfare_registration_credit_on_join();

-- 6. Allocator: returns how much of an incoming payment must be consumed for registration
-- The caller decides what to do with the remainder.
CREATE OR REPLACE FUNCTION public.apply_welfare_registration_payment(
  p_member_id uuid,
  p_gross numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member record;
  v_apply numeric := 0;
  v_remaining numeric := 0;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT * INTO v_member FROM public.welfare_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', 0, 'remainder', p_gross, 'fully_paid', false, 'status', null);
  END IF;

  IF v_member.registration_status NOT IN ('pending','partial')
     OR COALESCE(v_member.registration_fee_due,0) <= 0 THEN
    RETURN jsonb_build_object(
      'applied', 0,
      'remainder', p_gross,
      'fully_paid', v_member.registration_status = 'confirmed',
      'status', v_member.registration_status
    );
  END IF;

  v_remaining := GREATEST(v_member.registration_fee_due - COALESCE(v_member.registration_fee_paid,0), 0);
  v_apply := LEAST(v_remaining, p_gross);
  v_new_paid := COALESCE(v_member.registration_fee_paid,0) + v_apply;
  v_new_status := CASE WHEN v_new_paid >= v_member.registration_fee_due THEN 'confirmed' ELSE 'partial' END;

  UPDATE public.welfare_members
     SET registration_fee_paid = v_new_paid,
         registration_status   = v_new_status
   WHERE id = p_member_id;

  RETURN jsonb_build_object(
    'applied', v_apply,
    'remainder', p_gross - v_apply,
    'fully_paid', v_new_status = 'confirmed',
    'status', v_new_status,
    'fee_due', v_member.registration_fee_due,
    'fee_paid', v_new_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_welfare_registration_payment(uuid, numeric) TO authenticated, service_role;
