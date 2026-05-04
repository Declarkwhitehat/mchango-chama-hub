
ALTER TABLE public.profiles              ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.chama                 ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.chama_members         ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.mchango               ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.welfares              ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.withdrawals           ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.member_trust_scores   ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.chama_rejoin_requests ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_test ON public.profiles(is_test) WHERE is_test = true;
CREATE INDEX IF NOT EXISTS idx_chama_is_test    ON public.chama(is_test)    WHERE is_test = true;

CREATE TABLE IF NOT EXISTS public.simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  total_tests int NOT NULL DEFAULT 0,
  passed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_stage text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.simulation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage simulation runs" ON public.simulation_runs;
CREATE POLICY "Admins manage simulation runs"
  ON public.simulation_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.admin_purge_simulation_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chama_ids uuid[];
  v_user_ids uuid[];
  v_purged_chamas int := 0;
  v_purged_users int := 0;
  v_purged_runs int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can purge simulation data';
  END IF;

  SELECT array_agg(id) INTO v_chama_ids FROM public.chama WHERE is_test = true;
  SELECT array_agg(id) INTO v_user_ids  FROM public.profiles WHERE is_test = true;

  IF v_chama_ids IS NOT NULL THEN
    DELETE FROM public.member_cycle_payments WHERE cycle_id IN (
      SELECT id FROM public.contribution_cycles WHERE chama_id = ANY(v_chama_ids)
    );
    DELETE FROM public.contributions             WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.contribution_cycles       WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_member_debts        WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_cycle_deficits      WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_cycle_history       WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_overpayment_wallet  WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_member_removals     WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_messages            WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_invite_codes        WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_rejoin_requests     WHERE chama_id = ANY(v_chama_ids);
    BEGIN
      DELETE FROM public.payout_skips WHERE chama_id = ANY(v_chama_ids);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    DELETE FROM public.withdrawals               WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_members             WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama                     WHERE id = ANY(v_chama_ids);
    v_purged_chamas := array_length(v_chama_ids, 1);
  END IF;

  IF v_user_ids IS NOT NULL THEN
    DELETE FROM public.member_trust_scores WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.payment_methods     WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_roles          WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.notifications       WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.audit_logs          WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.withdrawals         WHERE requested_by = ANY(v_user_ids);
    DELETE FROM public.profiles            WHERE id = ANY(v_user_ids);
    DELETE FROM auth.users                 WHERE id = ANY(v_user_ids);
    v_purged_users := array_length(v_user_ids, 1);
  END IF;

  DELETE FROM public.simulation_runs WHERE started_at < now() - interval '30 days';
  GET DIAGNOSTICS v_purged_runs = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'chamas_purged', COALESCE(v_purged_chamas, 0),
    'users_purged',  COALESCE(v_purged_users, 0),
    'old_runs_purged', v_purged_runs
  );
END;
$$;
