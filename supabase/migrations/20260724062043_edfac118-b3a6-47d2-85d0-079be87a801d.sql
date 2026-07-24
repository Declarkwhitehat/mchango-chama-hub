
CREATE OR REPLACE FUNCTION public.apply_welfare_registration_payment(p_member_id uuid, p_gross numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member record;
  v_credits numeric := 0;
  v_effective_paid numeric := 0;
  v_remaining numeric := 0;
  v_apply numeric := 0;
  v_new_paid numeric;
  v_new_status text;
  v_reinstated boolean := false;
BEGIN
  SELECT * INTO v_member FROM public.welfare_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', 0, 'remainder', p_gross, 'fully_paid', false, 'status', null);
  END IF;

  -- Handle pending / partial / removed_unpaid. Skip if already confirmed or no fee owed.
  IF v_member.registration_status NOT IN ('pending','partial','removed_unpaid')
     OR COALESCE(v_member.registration_fee_due,0) <= 0 THEN
    RETURN jsonb_build_object(
      'applied', 0,
      'remainder', p_gross,
      'fully_paid', v_member.registration_status = 'confirmed',
      'status', v_member.registration_status
    );
  END IF;

  -- Pull open credits for this user+welfare and treat as already paid.
  SELECT COALESCE(SUM(amount),0) INTO v_credits
    FROM public.welfare_registration_credits
   WHERE welfare_id = v_member.welfare_id
     AND user_id = v_member.user_id
     AND consumed_at IS NULL;

  v_effective_paid := COALESCE(v_member.registration_fee_paid,0) + v_credits;
  v_remaining := GREATEST(v_member.registration_fee_due - v_effective_paid, 0);
  v_apply := LEAST(v_remaining, p_gross);
  v_new_paid := v_effective_paid + v_apply;
  v_new_status := CASE WHEN v_new_paid >= v_member.registration_fee_due THEN 'confirmed' ELSE 'partial' END;

  -- Consume credits if we're going to reinstate OR fold them into fee_paid for tracking.
  IF v_credits > 0 THEN
    UPDATE public.welfare_registration_credits
       SET consumed_at = now(),
           consumed_member_id = v_member.id
     WHERE welfare_id = v_member.welfare_id
       AND user_id = v_member.user_id
       AND consumed_at IS NULL;
  END IF;

  -- If member was removed_unpaid and now fully paid, reinstate.
  IF v_member.registration_status = 'removed_unpaid' AND v_new_status = 'confirmed' THEN
    UPDATE public.welfare_members
       SET registration_fee_paid = v_new_paid,
           registration_status = 'confirmed',
           status = 'active',
           registration_deadline = NULL
     WHERE id = p_member_id;
    v_reinstated := true;
  ELSE
    UPDATE public.welfare_members
       SET registration_fee_paid = v_new_paid,
           registration_status = v_new_status
     WHERE id = p_member_id;
  END IF;

  RETURN jsonb_build_object(
    'applied', v_apply,
    'remainder', p_gross - v_apply,
    'fully_paid', v_new_status = 'confirmed',
    'status', v_new_status,
    'fee_due', v_member.registration_fee_due,
    'fee_paid', v_new_paid,
    'reinstated', v_reinstated,
    'credits_consumed', v_credits
  );
END;
$function$;
