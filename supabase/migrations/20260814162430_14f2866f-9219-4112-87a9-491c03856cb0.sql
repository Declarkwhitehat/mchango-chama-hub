CREATE OR REPLACE FUNCTION public.get_member_payout_position(p_member_id uuid)
 RETURNS TABLE(position_in_queue integer, estimated_payout_date timestamp with time zone, estimated_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chama_id uuid;
  v_order_index integer;
  v_effective_position integer;
  v_was_skipped boolean;
  v_rescheduled_to integer;
  v_contribution_amount numeric;
  v_contribution_frequency text;
  v_every_n_days integer;
  v_start_date timestamptz;
  v_approved_member_count integer;
  v_latest_cycle record;
  v_beneficiary_pos integer;
  v_cycle_length_days integer;
  v_cycles_ahead integer;
BEGIN
  SELECT chama_id, order_index, was_skipped, rescheduled_to_position
  INTO v_chama_id, v_order_index, v_was_skipped, v_rescheduled_to
  FROM chama_members
  WHERE id = p_member_id AND approval_status = 'approved';

  IF v_chama_id IS NULL THEN
    RETURN;
  END IF;

  v_effective_position := CASE
    WHEN v_was_skipped = true AND v_rescheduled_to IS NOT NULL THEN v_rescheduled_to
    ELSE v_order_index
  END;

  SELECT c.contribution_amount, c.contribution_frequency, c.every_n_days_count, c.start_date, COUNT(cm.id)
  INTO v_contribution_amount, v_contribution_frequency, v_every_n_days, v_start_date, v_approved_member_count
  FROM chama c
  LEFT JOIN chama_members cm ON cm.chama_id = c.id AND cm.approval_status = 'approved' AND cm.status != 'removed'
  WHERE c.id = v_chama_id
  GROUP BY c.id;

  v_cycle_length_days := CASE v_contribution_frequency
    WHEN 'daily' THEN 1
    WHEN 'weekly' THEN 7
    WHEN 'monthly' THEN 30
    WHEN 'twice_monthly' THEN 15
    WHEN 'every_n_days' THEN COALESCE(v_every_n_days, 7)
    ELSE 7
  END;

  -- Latest cycle (complete or not) is the anchor
  SELECT cc.beneficiary_member_id, cc.end_date, cc.is_complete
  INTO v_latest_cycle
  FROM contribution_cycles cc
  WHERE cc.chama_id = v_chama_id
  ORDER BY cc.cycle_number DESC
  LIMIT 1;

  IF v_latest_cycle.beneficiary_member_id IS NOT NULL THEN
    SELECT CASE
      WHEN cm.was_skipped = true AND cm.rescheduled_to_position IS NOT NULL THEN cm.rescheduled_to_position
      ELSE cm.order_index
    END INTO v_beneficiary_pos
    FROM chama_members cm WHERE cm.id = v_latest_cycle.beneficiary_member_id;

    v_cycles_ahead := v_effective_position - COALESCE(v_beneficiary_pos, 1);
    IF v_cycles_ahead < 0 THEN
      v_cycles_ahead := v_cycles_ahead + GREATEST(v_approved_member_count, 1);
    END IF;

    -- If the anchor cycle already closed, its beneficiary was already paid:
    -- the member at the same position waits a full rotation.
    IF v_latest_cycle.is_complete AND v_cycles_ahead = 0 THEN
      v_cycles_ahead := GREATEST(v_approved_member_count, 1);
    END IF;

    RETURN QUERY
    SELECT
      v_effective_position::integer,
      (COALESCE(v_latest_cycle.end_date, now()) + (v_cycles_ahead * v_cycle_length_days * interval '1 day'))::timestamptz,
      (v_contribution_amount * v_approved_member_count)::numeric;
  ELSE
    RETURN QUERY
    SELECT
      v_effective_position::integer,
      (COALESCE(v_start_date, now()) + ((v_effective_position - 1) * v_cycle_length_days * interval '1 day'))::timestamptz,
      (v_contribution_amount * v_approved_member_count)::numeric;
  END IF;
END;
$function$;