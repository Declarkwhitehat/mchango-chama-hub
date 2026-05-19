
CREATE OR REPLACE FUNCTION public.try_unfreeze_chama_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member record;
  v_paid_since_freeze numeric;
  v_threshold numeric;
  v_user_id uuid;
  v_chama_id uuid;
  v_chama_name text;
BEGIN
  SELECT id, chama_id, user_id, status::text AS status, frozen_at,
         COALESCE(frozen_amount_due, 0) AS frozen_amount_due,
         COALESCE(frozen_unfreeze_fee, 0) AS frozen_unfreeze_fee
    INTO v_member
    FROM public.chama_members
   WHERE id = p_member_id;

  IF NOT FOUND OR v_member.status <> 'frozen' OR v_member.frozen_at IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_since_freeze
    FROM public.contributions
   WHERE member_id = p_member_id
     AND status = 'completed'
     AND created_at >= v_member.frozen_at;

  v_threshold := v_member.frozen_amount_due + v_member.frozen_unfreeze_fee;

  IF v_paid_since_freeze >= v_threshold AND v_threshold > 0 THEN
    UPDATE public.chama_members
       SET status = 'active',
           unfrozen_at = now(),
           missed_payments_count = 0,
           balance_deficit = 0,
           requires_admin_verification = false
     WHERE id = p_member_id;

    SELECT name INTO v_chama_name FROM public.chama WHERE id = v_member.chama_id;

    INSERT INTO public.audit_logs (action, table_name, record_id, new_values)
    VALUES (
      'MEMBER_AUTO_UNFROZEN', 'chama_members', p_member_id,
      jsonb_build_object('paid_since_freeze', v_paid_since_freeze,
                         'threshold', v_threshold,
                         'chama', v_chama_name)
    );

    IF v_member.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, category, related_entity_id, related_entity_type)
      VALUES (
        v_member.user_id,
        'Account Unfrozen',
        'Your account in "' || COALESCE(v_chama_name,'') || '" has been auto-unfrozen. You can resume contributions.',
        'success', 'chama', v_member.chama_id, 'chama'
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_try_unfreeze_after_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.member_id IS NOT NULL THEN
    PERFORM public.try_unfreeze_chama_member(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contributions_try_unfreeze ON public.contributions;
CREATE TRIGGER contributions_try_unfreeze
AFTER INSERT OR UPDATE OF status ON public.contributions
FOR EACH ROW
EXECUTE FUNCTION public.trg_try_unfreeze_after_contribution();
