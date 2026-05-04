-- Purge all simulator test data and remove simulator infrastructure entirely.

-- 1. Delete child rows tied to test chamas
DO $$
DECLARE
  v_chama_ids uuid[];
  v_user_ids  uuid[];
BEGIN
  SELECT array_agg(id) INTO v_chama_ids FROM public.chama WHERE is_test = true;
  SELECT array_agg(id) INTO v_user_ids  FROM public.profiles WHERE is_test = true;

  IF v_chama_ids IS NOT NULL THEN
    DELETE FROM public.member_cycle_payments WHERE cycle_id IN (
      SELECT id FROM public.contribution_cycles WHERE chama_id = ANY(v_chama_ids)
    );
    DELETE FROM public.contributions            WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.contribution_cycles      WHERE chama_id = ANY(v_chama_ids);
    BEGIN DELETE FROM public.chama_member_debts       WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_cycle_deficits     WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_cycle_history      WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_overpayment_wallet WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_member_removals    WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_messages           WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_invite_codes       WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.chama_rejoin_requests    WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN DELETE FROM public.payout_skips             WHERE chama_id = ANY(v_chama_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    DELETE FROM public.withdrawals  WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama_members WHERE chama_id = ANY(v_chama_ids);
    DELETE FROM public.chama         WHERE id = ANY(v_chama_ids);
  END IF;

  IF v_user_ids IS NOT NULL THEN
    BEGIN DELETE FROM public.member_trust_scores WHERE user_id = ANY(v_user_ids); EXCEPTION WHEN undefined_table THEN NULL; END;
    DELETE FROM public.payment_methods     WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_roles          WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.notifications       WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.audit_logs          WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.withdrawals         WHERE requested_by = ANY(v_user_ids);
    DELETE FROM public.chama_members       WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.profiles            WHERE id = ANY(v_user_ids);
    DELETE FROM auth.users                 WHERE id = ANY(v_user_ids);
  END IF;
END $$;

-- 2. Drop simulator infrastructure entirely
DROP TABLE IF EXISTS public.simulation_runs CASCADE;
DROP FUNCTION IF EXISTS public.admin_purge_simulation_data();

-- 3. Remove the is_test columns we added for the simulator
ALTER TABLE public.profiles               DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.chama                  DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.chama_members          DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.mchango                DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.welfares               DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.withdrawals            DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.chama_rejoin_requests  DROP COLUMN IF EXISTS is_test;
DO $$ BEGIN
  ALTER TABLE public.member_trust_scores  DROP COLUMN IF EXISTS is_test;
EXCEPTION WHEN undefined_table THEN NULL; END $$;