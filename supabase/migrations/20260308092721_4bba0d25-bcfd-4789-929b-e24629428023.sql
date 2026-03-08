
CREATE OR REPLACE FUNCTION public.get_member_payout_position(
  p_member_id uuid
) RETURNS TABLE (
  position_in_queue integer,
  estimated_payout_date timestamp with time zone,
  estimated_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_current_cycle_beneficiary uuid;
  v_current_cycle_end timestamptz;
  v_current_beneficiary_effective_pos integer;
  v_cycle_length_days integer;
  v_cycles_ahead integer;
BEGIN
  -- Get member info
  SELECT chama_id, order_index, was_skipped, rescheduled_to_position
  INTO v_chama_id, v_order_index, v_was_skipped, v_rescheduled_to
  FROM chama_members
  WHERE id = p_member_id AND approval_status = 'approved';

  IF v_chama_id IS NULL THEN
    RETURN;
  END IF;

  -- Effective position: use rescheduled_to_position if skipped, otherwise order_index
  v_effective_position := CASE 
    WHEN v_was_skipped = true AND v_rescheduled_to IS NOT NULL THEN v_rescheduled_to
    ELSE v_order_index
  END;

  -- Get chama details
  SELECT c.contribution_amount, c.contribution_frequency, c.every_n_days_count, c.start_date, COUNT(cm.id)
  INTO v_contribution_amount, v_contribution_frequency, v_every_n_days, v_start_date, v_approved_member_count
  FROM chama c
  LEFT JOIN chama_members cm ON cm.chama_id = c.id AND cm.approval_status = 'approved' AND cm.status != 'removed'
  WHERE c.id = v_chama_id
  GROUP BY c.id;

  -- Determine cycle length in days
  v_cycle_length_days := CASE v_contribution_frequency
    WHEN 'daily' THEN 1
    WHEN 'weekly' THEN 7
    WHEN 'monthly' THEN 30
    WHEN 'twice_monthly' THEN 15
    WHEN 'every_n_days' THEN COALESCE(v_every_n_days, 7)
    ELSE 7
  END;

  -- Try to get the current active cycle's beneficiary
  SELECT cc.beneficiary_member_id, cc.end_date
  INTO v_current_cycle_beneficiary, v_current_cycle_end
  FROM contribution_cycles cc
  WHERE cc.chama_id = v_chama_id AND cc.is_complete = false
  ORDER BY cc.cycle_number DESC
  LIMIT 1;

  IF v_current_cycle_beneficiary IS NOT NULL THEN
    -- Get the effective position of the current beneficiary
    SELECT CASE 
      WHEN cm.was_skipped = true AND cm.rescheduled_to_position IS NOT NULL THEN cm.rescheduled_to_position
      ELSE cm.order_index
    END INTO v_current_beneficiary_effective_pos
    FROM chama_members cm WHERE cm.id = v_current_cycle_beneficiary;

    -- Calculate how many cycles ahead this member is from the current beneficiary
    v_cycles_ahead := v_effective_position - COALESCE(v_current_beneficiary_effective_pos, 1);
    IF v_cycles_ahead < 0 THEN
      v_cycles_ahead := v_cycles_ahead + v_approved_member_count;
    END IF;

    RETURN QUERY
    SELECT
      v_effective_position::integer as position_in_queue,
      (COALESCE(v_current_cycle_end, now()) + (v_cycles_ahead * v_cycle_length_days * interval '1 day'))::timestamptz as estimated_payout_date,
      (v_contribution_amount * v_approved_member_count)::numeric as estimated_amount;
  ELSE
    -- Fallback: calculate from start_date
    RETURN QUERY
    SELECT
      v_effective_position::integer as position_in_queue,
      (COALESCE(v_start_date, now()) + ((v_effective_position - 1) * v_cycle_length_days * interval '1 day'))::timestamptz as estimated_payout_date,
      (v_contribution_amount * v_approved_member_count)::numeric as estimated_amount;
  END IF;
END;
$$;
