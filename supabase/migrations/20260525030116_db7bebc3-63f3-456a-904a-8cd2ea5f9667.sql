-- 1) Authoritative current cycle pool — returns the same numbers to every member
CREATE OR REPLACE FUNCTION public.get_chama_current_pool(p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cycle record;
  v_rows record;
  v_chama record;
  v_paid int := 0;
  v_total int := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  -- Access check: admin OR member of the chama
  IF NOT (
    has_role(v_uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM chama_members
       WHERE chama_id = p_chama_id AND user_id = v_uid
         AND approval_status = 'approved'
    )
  ) THEN
    RETURN jsonb_build_object('error','Forbidden');
  END IF;

  SELECT id, contribution_amount, commission_rate
    INTO v_chama
    FROM chama WHERE id = p_chama_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Chama not found');
  END IF;

  -- Pick the cycle whose window brackets "now", else latest open cycle
  SELECT id, cycle_number, start_date, end_date, payout_processed, beneficiary_member_id
    INTO v_cycle
    FROM contribution_cycles
   WHERE chama_id = p_chama_id
     AND start_date <= now() AND end_date >= now()
   ORDER BY cycle_number DESC
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT id, cycle_number, start_date, end_date, payout_processed, beneficiary_member_id
      INTO v_cycle
      FROM contribution_cycles
     WHERE chama_id = p_chama_id AND payout_processed = false
     ORDER BY cycle_number DESC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'cycle_id', NULL,
      'paid_count', 0,
      'total_members', 0,
      'collected_gross', 0,
      'collected_net', 0,
      'target_gross', 0,
      'target_net', 0
    );
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE COALESCE(fully_paid, false))::int AS paid,
    COUNT(*)::int AS total,
    COALESCE(SUM(LEAST(COALESCE(amount_paid,0), COALESCE(amount_due,0))), 0) AS gross
   INTO v_paid, v_total, v_gross
   FROM member_cycle_payments
  WHERE cycle_id = v_cycle.id;

  v_net := v_gross * (1 - COALESCE(v_chama.commission_rate, 0.05));

  RETURN jsonb_build_object(
    'success', true,
    'cycle_id', v_cycle.id,
    'cycle_number', v_cycle.cycle_number,
    'cycle_end', v_cycle.end_date,
    'beneficiary_member_id', v_cycle.beneficiary_member_id,
    'paid_count', v_paid,
    'total_members', v_total,
    'collected_gross', v_gross,
    'collected_net', round(v_net::numeric, 2),
    'target_gross', v_total * v_chama.contribution_amount,
    'target_net', round((v_total * v_chama.contribution_amount * (1 - COALESCE(v_chama.commission_rate, 0.05)))::numeric, 2),
    'contribution_amount', v_chama.contribution_amount,
    'commission_rate', COALESCE(v_chama.commission_rate, 0.05)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chama_current_pool(uuid) TO authenticated;

-- 2) Live outstanding for any member — debts + unpaid cycles + carry-forward
CREATE OR REPLACE FUNCTION public.get_member_live_outstanding(p_member_id uuid, p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_unpaid_cycles_amount numeric := 0;
  v_unpaid_cycle_count int := 0;
  v_debt_principal numeric := 0;
  v_debt_penalty numeric := 0;
  v_debt_count int := 0;
  v_carry numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  -- Access: admin, any member of the chama, or that member themselves
  IF NOT (
    has_role(v_uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM chama_members
       WHERE chama_id = p_chama_id AND user_id = v_uid
         AND approval_status = 'approved'
    )
  ) THEN
    RETURN jsonb_build_object('error','Forbidden');
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(amount_due,0) - COALESCE(amount_paid,0), 0)),0),
         COUNT(*) FILTER (WHERE NOT COALESCE(fully_paid,false))
    INTO v_unpaid_cycles_amount, v_unpaid_cycle_count
    FROM member_cycle_payments
   WHERE member_id = p_member_id
     AND NOT COALESCE(fully_paid,false);

  SELECT COALESCE(SUM(principal_remaining),0),
         COALESCE(SUM(penalty_remaining),0),
         COUNT(*)
    INTO v_debt_principal, v_debt_penalty, v_debt_count
    FROM chama_member_debts
   WHERE member_id = p_member_id
     AND chama_id = p_chama_id
     AND status IN ('outstanding','partial');

  SELECT COALESCE(SUM(amount),0)
    INTO v_carry
    FROM chama_overpayment_wallet
   WHERE member_id = p_member_id
     AND chama_id = p_chama_id
     AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'unpaid_cycles_amount', v_unpaid_cycles_amount,
    'unpaid_cycle_count', v_unpaid_cycle_count,
    'debt_principal_remaining', v_debt_principal,
    'debt_penalty_remaining', v_debt_penalty,
    'debt_count', v_debt_count,
    'wallet_credit_net', v_carry,
    -- Total outstanding gross: combine unpaid cycle gross + outstanding debt principal + penalty
    -- (debt principal + penalty is gross owed by member; wallet credit is net so callers convert as needed)
    'total_outstanding_gross', v_unpaid_cycles_amount + v_debt_principal + v_debt_penalty,
    'total_outstanding_no_penalty', v_unpaid_cycles_amount + v_debt_principal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_live_outstanding(uuid, uuid) TO authenticated;

-- 3) Recompute and persist member balance_deficit + missed_payments_count from live data
CREATE OR REPLACE FUNCTION public.recompute_chama_member_balance(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chama_id uuid;
  v_unpaid_amount numeric := 0;
  v_debt_principal numeric := 0;
  v_debt_penalty numeric := 0;
  v_unpaid_count int := 0;
BEGIN
  SELECT chama_id INTO v_chama_id FROM chama_members WHERE id = p_member_id;
  IF v_chama_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(amount_due,0) - COALESCE(amount_paid,0), 0)),0),
         COUNT(*) FILTER (WHERE NOT COALESCE(fully_paid,false))
    INTO v_unpaid_amount, v_unpaid_count
    FROM member_cycle_payments mcp
    JOIN contribution_cycles cc ON cc.id = mcp.cycle_id
   WHERE mcp.member_id = p_member_id
     AND cc.chama_id = v_chama_id
     AND NOT COALESCE(mcp.fully_paid,false);

  SELECT COALESCE(SUM(principal_remaining),0), COALESCE(SUM(penalty_remaining),0)
    INTO v_debt_principal, v_debt_penalty
    FROM chama_member_debts
   WHERE member_id = p_member_id
     AND chama_id = v_chama_id
     AND status IN ('outstanding','partial');

  UPDATE chama_members
     SET balance_deficit = (v_unpaid_amount + v_debt_principal + v_debt_penalty),
         missed_payments_count = v_unpaid_count
   WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_chama_member_balance(uuid) TO authenticated;

-- 4) Update get_member_dashboard to include outstanding debts in total_outstanding
CREATE OR REPLACE FUNCTION public.get_member_dashboard(p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member record;
  v_chama record;
  v_member_count int;
  v_current_cycle record;
  v_current_payment record;
  v_current_cycle_json jsonb := NULL;
  v_payout record;
  v_payout_json jsonb := NULL;
  v_contributions jsonb;
  v_missed jsonb;
  v_unpaid_amount numeric := 0;
  v_unpaid_count int := 0;
  v_debt_principal numeric := 0;
  v_debt_penalty numeric := 0;
  v_total_outstanding numeric := 0;
  v_removal record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  SELECT cm.*, p.full_name, p.email, p.phone
    INTO v_member
    FROM chama_members cm
    LEFT JOIN profiles p ON p.id = cm.user_id
   WHERE cm.chama_id = p_chama_id AND cm.user_id = v_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Not a member','details','You are not a member of this chama');
  END IF;

  IF v_member.approval_status <> 'approved' THEN
    RETURN jsonb_build_object('error','Pending approval',
      'details','Your membership request is still pending approval',
      'approval_status', v_member.approval_status);
  END IF;

  IF v_member.status = 'removed' THEN
    SELECT * INTO v_removal FROM chama_member_removals
     WHERE member_id = v_member.id ORDER BY removed_at DESC LIMIT 1;
    SELECT * INTO v_chama FROM chama WHERE id = p_chama_id;
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'is_removed', true,
        'member', jsonb_build_object(
          'id', v_member.id,
          'full_name', v_member.full_name,
          'member_code', v_member.member_code,
          'removal_reason', COALESCE(v_member.removal_reason, v_removal.removal_reason, 'Removed due to consecutive missed payments'),
          'removed_at', COALESCE(v_member.removed_at, v_removal.removed_at)
        ),
        'chama', jsonb_build_object('name', COALESCE(v_chama.name, 'Unknown'))
      )
    );
  END IF;

  SELECT * INTO v_chama FROM chama WHERE id = p_chama_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Chama not found');
  END IF;

  SELECT COUNT(*) INTO v_member_count
    FROM chama_members
   WHERE chama_id = p_chama_id AND approval_status = 'approved';

  SELECT * INTO v_current_cycle
    FROM contribution_cycles
   WHERE chama_id = p_chama_id
     AND start_date <= now() AND end_date >= now()
   LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_current_payment
      FROM member_cycle_payments
     WHERE member_id = v_member.id AND cycle_id = v_current_cycle.id
     LIMIT 1;
    IF FOUND THEN
      v_current_cycle_json := jsonb_build_object(
        'is_paid', v_current_payment.is_paid,
        'amount_paid', v_current_payment.amount_paid,
        'amount_due', v_current_payment.amount_due,
        'paid_at', v_current_payment.paid_at
      );
    END IF;
  END IF;

  BEGIN
    SELECT * INTO v_payout FROM get_member_payout_position(v_member.id);
    IF FOUND AND v_payout.position_in_queue IS NOT NULL THEN
      v_payout_json := jsonb_build_object(
        'position_in_queue', v_payout.position_in_queue,
        'estimated_payout_date', v_payout.estimated_payout_date,
        'estimated_amount', v_payout.estimated_amount
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_payout_json := NULL;
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.contribution_date DESC), '[]'::jsonb)
    INTO v_contributions
    FROM contributions c
   WHERE c.chama_id = p_chama_id AND c.member_id = v_member.id;

  -- Unpaid cycles (live)
  WITH mp AS (
    SELECT mcp.*, cc.cycle_number, cc.start_date AS c_start, cc.end_date AS c_end, cc.due_amount AS c_due
      FROM member_cycle_payments mcp
      JOIN contribution_cycles cc ON cc.id = mcp.cycle_id
     WHERE mcp.member_id = v_member.id
       AND cc.chama_id = p_chama_id
       AND NOT COALESCE(mcp.fully_paid, false)
     ORDER BY mcp.created_at ASC
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'cycle_number', cycle_number,
      'start_date',   c_start,
      'end_date',     c_end,
      'amount_due',   amount_due,
      'amount_paid',  COALESCE(amount_paid,0),
      'amount_remaining', GREATEST(COALESCE(amount_due,0) - COALESCE(amount_paid,0), 0)
    )), '[]'::jsonb),
    COALESCE(SUM(GREATEST(COALESCE(amount_due,0) - COALESCE(amount_paid,0), 0)), 0),
    COALESCE(COUNT(*), 0)
  INTO v_missed, v_unpaid_amount, v_unpaid_count
  FROM mp;

  -- Outstanding debts (principal + penalty)
  SELECT COALESCE(SUM(principal_remaining),0), COALESCE(SUM(penalty_remaining),0)
    INTO v_debt_principal, v_debt_penalty
    FROM chama_member_debts
   WHERE member_id = v_member.id
     AND chama_id = p_chama_id
     AND status IN ('outstanding','partial');

  v_total_outstanding := v_unpaid_amount + v_debt_principal + v_debt_penalty;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'member', jsonb_build_object(
        'id', v_member.id,
        'full_name', v_member.full_name,
        'email', v_member.email,
        'phone', v_member.phone,
        'member_code', v_member.member_code,
        'joined_at', v_member.joined_at,
        'order_index', v_member.order_index,
        'balance_credit', COALESCE(v_member.balance_credit,0),
        'balance_deficit', v_total_outstanding,
        'missed_payments_count', v_unpaid_count,
        'total_outstanding', v_total_outstanding,
        'debt_principal_remaining', v_debt_principal,
        'debt_penalty_remaining', v_debt_penalty,
        'last_payment_date', v_member.last_payment_date,
        'next_due_date', v_member.next_due_date,
        'status', v_member.status,
        'frozen_amount_due', v_member.frozen_amount_due,
        'frozen_unfreeze_fee', v_member.frozen_unfreeze_fee
      ),
      'missed_payments', v_missed,
      'chama', jsonb_build_object(
        'name', v_chama.name,
        'contribution_amount', v_chama.contribution_amount,
        'contribution_frequency', v_chama.contribution_frequency,
        'commission_rate', COALESCE(v_chama.commission_rate, 0.05),
        'every_n_days_count', v_chama.every_n_days_count,
        'member_count', v_member_count,
        'status', v_chama.status,
        'start_date', v_chama.start_date
      ),
      'current_cycle', v_current_cycle_json,
      'payment_history', v_contributions,
      'payout_schedule', v_payout_json
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_dashboard(uuid) TO authenticated;