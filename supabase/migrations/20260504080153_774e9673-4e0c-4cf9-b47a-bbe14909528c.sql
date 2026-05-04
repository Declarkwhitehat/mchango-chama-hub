
-- 1. Chama: restart window + defining cycle
ALTER TABLE public.chama
  ADD COLUMN IF NOT EXISTS restart_window_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS restart_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS restart_window_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_defining_cycle boolean NOT NULL DEFAULT false;

ALTER TABLE public.chama
  ADD CONSTRAINT chama_restart_window_hours_check
  CHECK (restart_window_hours BETWEEN 1 AND 168) NOT VALID;

-- Raise default cap to 60 for new chamas
ALTER TABLE public.chama ALTER COLUMN max_members SET DEFAULT 60;

-- 2. Profiles: permanent payout-default flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_payout_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_default_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_default_reason text,
  ADD COLUMN IF NOT EXISTS payout_default_cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_default_cleared_by uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_has_payout_default
  ON public.profiles(has_payout_default) WHERE has_payout_default = true;

-- 3. Chama members: track payout receipt
ALTER TABLE public.chama_members
  ADD COLUMN IF NOT EXISTS received_payout_this_chama boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_payout_at timestamptz;

-- 4. Allow order_index changes during restart (cycle_complete status)
CREATE OR REPLACE FUNCTION public.prevent_order_index_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.order_index IS DISTINCT FROM NEW.order_index THEN
    SELECT status::text INTO v_status FROM public.chama WHERE id = NEW.chama_id;
    -- Allow resequencing during cycle_complete restart window or pending pre-start
    IF v_status IN ('cycle_complete', 'pending') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Cannot modify order_index. Payout order is automatically determined by join date.';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Admin RPC to clear payout default flag
CREATE OR REPLACE FUNCTION public.admin_clear_payout_default(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can clear payout default';
  END IF;

  UPDATE public.profiles
  SET has_payout_default = false,
      payout_default_cleared_at = now(),
      payout_default_cleared_by = auth.uid()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$;
