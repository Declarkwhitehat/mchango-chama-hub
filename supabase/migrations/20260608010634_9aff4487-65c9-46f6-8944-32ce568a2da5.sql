CREATE OR REPLACE FUNCTION public.get_member_dashboard(p_chama_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_principal_outstanding numeric := 0;
  v_penalty_outstanding numeric := 0;
  v_unpaid_count int := 0;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', c.id,
            'amount', c.amount,
            'status', c.status,
            'contribution_date', c.contribution_date,
            'created_at', c.created_at,
            'payment_reference', c.payment_reference,
            'mpesa_receipt_number', c.mpesa_receipt_number,
            'payment_notes', c.payment_notes,
            'paid_by_member_id', c.paid_by_member_id,
            'paid_by_self', (c.paid_by_member_id IS NULL OR c.paid_by_member_id = v_member.id),
            'payer_member_code', payer.member_code,
            'payer_full_name', payer_p.full_name
          ) ORDER BY c.contribution_date DESC), '[]'::jsonb)
    INTO v_contributions
    FROM contributions c
    LEFT JOIN chama_members payer ON payer.id = c.paid_by_member_id
    LEFT JOIN profiles payer_p ON payer_p.id = payer.user_id
   WHERE c.chama_id = p_chama_id AND c.member_id = v_member.id;

  -- Per-cycle outstanding — but only for chamas that are still active.
  -- Deleted/inactive chamas should not surface penalty warnings; the debt
  -- can't be settled because the cycle is gone, so dragging the alert
  -- forward only confuses users (and triggered the false-positive
  -- "1 Missed Payment" reports on Test404/Chacha test 2 style chamas).
  IF v_chama.status IN ('deleted','inactive') THEN
    v_missed := '[]'::jsonb;
    v_principal_outstanding := 0;
    v_penalty_outstanding := 0;
    v_unpaid_count := 0;
  ELSE
    WITH cycles AS (
      SELECT cc.id AS cycle_id, cc.cycle_number, cc.start_date, cc.end_date, cc.due_amount
        FROM contribution_cycles cc
       WHERE cc.chama_id = p_chama_id
    ),
    per_cycle AS (
      SELECT
        c.cycle_id, c.cycle_number, c.start_date, c.end_date, c.due_amount,
        COALESCE((SELECT mcp.amount_due
                    FROM member_cycle_payments mcp
                   WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = v_member.id), c.due_amount, 0) AS amount_due,
        COALESCE((SELECT mcp.amount_paid
                    FROM member_cycle_payments mcp
                   WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = v_member.id), 0) AS amount_paid,
        GREATEST(
          COALESCE((SELECT GREATEST(COALESCE(mcp.amount_due,0) - COALESCE(mcp.amount_paid,0), 0)
                      FROM member_cycle_payments mcp
                     WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = v_member.id), 0),
          COALESCE((SELECT SUM(d.principal_remaining)
                      FROM chama_member_debts d
                     WHERE d.cycle_id = c.cycle_id AND d.member_id = v_member.id
                       AND d.status IN ('outstanding','partial')), 0)
        ) AS principal_out,
        COALESCE((SELECT SUM(d.penalty_remaining)
                    FROM chama_member_debts d
                   WHERE d.cycle_id = c.cycle_id AND d.member_id = v_member.id
                     AND d.status IN ('outstanding','partial')), 0) AS penalty_out
      FROM cycles c
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'cycle_number', cycle_number,
        'start_date', start_date,
        'end_date', end_date,
        'amount_due', amount_due,
        'amount_paid', amount_paid,
        'amount_remaining', principal_out,
        'penalty_remaining', penalty_out
      ) ORDER BY cycle_number) FILTER (WHERE principal_out > 0 OR penalty_out > 0), '[]'::jsonb),
      COALESCE(SUM(principal_out), 0),
      COALESCE(SUM(penalty_out), 0),
      COUNT(*) FILTER (WHERE principal_out > 0)
    INTO v_missed, v_principal_outstanding, v_penalty_outstanding, v_unpaid_count
    FROM per_cycle;
  END IF;

  v_total_outstanding := v_principal_outstanding + v_penalty_outstanding;

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
        'debt_principal_remaining', v_principal_outstanding,
        'debt_penalty_remaining', v_penalty_outstanding,
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
$function$;