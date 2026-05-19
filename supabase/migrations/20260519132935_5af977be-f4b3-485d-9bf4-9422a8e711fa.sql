
CREATE OR REPLACE FUNCTION public.get_member_dashboard(p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member record;
  v_chama record;
  v_member_count int;
  v_current_cycle record;
  v_current_payment record;
  v_has_payment boolean := false;
  v_current_cycle_json jsonb := NULL;
  v_payout record;
  v_has_payout boolean := false;
  v_payout_json jsonb := NULL;
  v_contributions jsonb;
  v_missed jsonb;
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
    SELECT * INTO v_removal
      FROM chama_member_removals
     WHERE member_id = v_member.id
     ORDER BY removed_at DESC
     LIMIT 1;
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
      v_has_payment := true;
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
    IF FOUND THEN
      v_has_payout := true;
      IF v_payout.position_in_queue IS NOT NULL THEN
        v_payout_json := jsonb_build_object(
          'position_in_queue', v_payout.position_in_queue,
          'estimated_payout_date', v_payout.estimated_payout_date,
          'estimated_amount', v_payout.estimated_amount
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_has_payout := false;
    v_payout_json := NULL;
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.contribution_date DESC), '[]'::jsonb)
    INTO v_contributions
    FROM contributions c
   WHERE c.chama_id = p_chama_id AND c.member_id = v_member.id;

  WITH mp AS (
    SELECT mcp.*, cc.cycle_number, cc.start_date AS c_start, cc.end_date AS c_end, cc.due_amount AS c_due
      FROM member_cycle_payments mcp
      JOIN contribution_cycles cc ON cc.id = mcp.cycle_id
     WHERE mcp.member_id = v_member.id AND mcp.is_paid = false
     ORDER BY mcp.created_at ASC
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'cycle_number', cycle_number,
      'start_date',   c_start,
      'end_date',     c_end,
      'amount_due',   amount_due,
      'amount_paid',  COALESCE(amount_paid,0),
      'amount_remaining', COALESCE(amount_due,0) - COALESCE(amount_paid,0)
    )), '[]'::jsonb),
    COALESCE(SUM(COALESCE(amount_due,0) - COALESCE(amount_paid,0)), 0)
  INTO v_missed, v_total_outstanding
  FROM mp;

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
        'balance_deficit', COALESCE(v_member.balance_deficit,0),
        'missed_payments_count', COALESCE(v_member.missed_payments_count,0),
        'total_outstanding', v_total_outstanding,
        'last_payment_date', v_member.last_payment_date,
        'next_due_date', v_member.next_due_date
      ),
      'missed_payments', v_missed,
      'chama', jsonb_build_object(
        'name', v_chama.name,
        'contribution_amount', v_chama.contribution_amount,
        'contribution_frequency', v_chama.contribution_frequency,
        'commission_rate', COALESCE(v_chama.commission_rate, 0.05),
        'member_count', v_member_count,
        'status', v_chama.status
      ),
      'current_cycle', v_current_cycle_json,
      'payment_history', v_contributions,
      'payout_schedule', v_payout_json
    )
  );
END;
$$;
