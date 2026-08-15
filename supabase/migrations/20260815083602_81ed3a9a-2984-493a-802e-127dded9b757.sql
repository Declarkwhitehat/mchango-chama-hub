CREATE OR REPLACE FUNCTION public.advance_chama_deadline(
  p_deadline timestamptz,
  p_frequency text,
  p_every_n_days integer,
  p_monthly_day integer,
  p_monthly_day_2 integer,
  p_steps integer
) RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result timestamptz := p_deadline;
  v_kenya timestamp;
  v_year integer;
  v_month integer;
  v_day integer;
  v_first integer;
  v_second integer;
  i integer;
BEGIN
  IF p_steps <= 0 THEN RETURN v_result; END IF;
  FOR i IN 1..p_steps LOOP
    v_kenya := v_result AT TIME ZONE 'Africa/Nairobi';
    CASE p_frequency
      WHEN 'daily' THEN v_result := v_result + interval '1 day';
      WHEN 'weekly' THEN v_result := v_result + interval '7 days';
      WHEN 'every_n_days' THEN v_result := v_result + make_interval(days => GREATEST(COALESCE(p_every_n_days, 7), 1));
      WHEN 'monthly' THEN
        IF p_monthly_day IS NULL THEN
          v_result := ((date_trunc('month', v_kenya) + interval '2 months - 1 day')::date + time '22:00') AT TIME ZONE 'Africa/Nairobi';
        ELSE
          v_year := extract(year FROM v_kenya)::integer;
          v_month := extract(month FROM v_kenya)::integer + 1;
          v_result := (make_date(v_year + ((v_month - 1) / 12), ((v_month - 1) % 12) + 1, p_monthly_day) + time '22:00') AT TIME ZONE 'Africa/Nairobi';
        END IF;
      WHEN 'twice_monthly' THEN
        v_first := LEAST(COALESCE(p_monthly_day, 1), COALESCE(p_monthly_day_2, 15));
        v_second := GREATEST(COALESCE(p_monthly_day, 1), COALESCE(p_monthly_day_2, 15));
        v_year := extract(year FROM v_kenya)::integer;
        v_month := extract(month FROM v_kenya)::integer;
        v_day := extract(day FROM v_kenya)::integer;
        IF v_day < v_first THEN
          v_result := (make_date(v_year, v_month, v_first) + time '22:00') AT TIME ZONE 'Africa/Nairobi';
        ELSIF v_day < v_second THEN
          v_result := (make_date(v_year, v_month, v_second) + time '22:00') AT TIME ZONE 'Africa/Nairobi';
        ELSE
          v_month := v_month + 1;
          v_result := (make_date(v_year + ((v_month - 1) / 12), ((v_month - 1) % 12) + 1, v_first) + time '22:00') AT TIME ZONE 'Africa/Nairobi';
        END IF;
      ELSE v_result := v_result + interval '7 days';
    END CASE;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_payout_position(p_member_id uuid)
RETURNS TABLE(position_in_queue integer, estimated_payout_date timestamptz, estimated_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chama_id uuid;
  v_effective_position integer;
  v_contribution_amount numeric;
  v_frequency text;
  v_every_n_days integer;
  v_monthly_day integer;
  v_monthly_day_2 integer;
  v_start_date timestamptz;
  v_member_count integer;
  v_latest record;
  v_beneficiary_position integer;
  v_cycles_ahead integer;
  v_anchor timestamptz;
BEGIN
  SELECT cm.chama_id,
         CASE WHEN cm.was_skipped AND cm.rescheduled_to_position IS NOT NULL THEN cm.rescheduled_to_position ELSE cm.order_index END
    INTO v_chama_id, v_effective_position
    FROM chama_members cm
   WHERE cm.id = p_member_id AND cm.approval_status = 'approved';
  IF v_chama_id IS NULL THEN RETURN; END IF;

  SELECT c.contribution_amount, c.contribution_frequency::text, c.every_n_days_count,
         c.monthly_contribution_day, c.monthly_contribution_day_2, c.start_date,
         COUNT(cm.id)::integer
    INTO v_contribution_amount, v_frequency, v_every_n_days, v_monthly_day,
         v_monthly_day_2, v_start_date, v_member_count
    FROM chama c
    LEFT JOIN chama_members cm ON cm.chama_id=c.id AND cm.approval_status='approved' AND cm.status <> 'removed'
   WHERE c.id=v_chama_id
   GROUP BY c.id;

  SELECT cc.beneficiary_member_id, cc.end_date, cc.is_complete, cc.payout_processed
    INTO v_latest
    FROM contribution_cycles cc
   WHERE cc.chama_id=v_chama_id
   ORDER BY cc.cycle_number DESC LIMIT 1;

  IF v_latest.beneficiary_member_id IS NOT NULL THEN
    SELECT CASE WHEN cm.was_skipped AND cm.rescheduled_to_position IS NOT NULL THEN cm.rescheduled_to_position ELSE cm.order_index END
      INTO v_beneficiary_position FROM chama_members cm WHERE cm.id=v_latest.beneficiary_member_id;
    v_cycles_ahead := v_effective_position - COALESCE(v_beneficiary_position,1);
    IF v_cycles_ahead < 0 THEN v_cycles_ahead := v_cycles_ahead + GREATEST(v_member_count,1); END IF;
    IF (v_latest.is_complete OR v_latest.payout_processed) AND v_cycles_ahead=0 THEN v_cycles_ahead := GREATEST(v_member_count,1); END IF;
    v_anchor := v_latest.end_date;
  ELSE
    v_cycles_ahead := GREATEST(v_effective_position - 1, 0);
    v_anchor := v_start_date;
  END IF;

  RETURN QUERY SELECT v_effective_position,
    public.advance_chama_deadline(v_anchor, v_frequency, v_every_n_days, v_monthly_day, v_monthly_day_2, v_cycles_ahead),
    (v_contribution_amount * v_member_count)::numeric;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_chama_current_pool(p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cycle record;
  v_chama record;
  v_paid integer := 0;
  v_total integer := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Unauthorized'); END IF;
  IF NOT (has_role(v_uid,'admin'::app_role) OR EXISTS (
    SELECT 1 FROM chama_members WHERE chama_id=p_chama_id AND user_id=v_uid AND approval_status='approved'
  )) THEN RETURN jsonb_build_object('error','Forbidden'); END IF;

  SELECT id,contribution_amount,commission_rate INTO v_chama FROM chama WHERE id=p_chama_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Chama not found'); END IF;

  SELECT id,cycle_number,start_date,end_date,beneficiary_member_id
    INTO v_cycle FROM contribution_cycles
   WHERE chama_id=p_chama_id AND payout_processed=false AND is_complete=false
     AND start_date <= now() AND end_date >= now()
   ORDER BY cycle_number DESC LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('success',true,'cycle_id',NULL,'paid_count',0,'total_members',0,'collected_gross',0,'collected_net',0,'target_gross',0,'target_net',0); END IF;

  SELECT COUNT(*) FILTER (WHERE COALESCE(fully_paid,false))::integer, COUNT(*)::integer,
         COALESCE(SUM(LEAST(COALESCE(amount_paid,0),COALESCE(amount_due,0))),0)
    INTO v_paid,v_total,v_gross FROM member_cycle_payments WHERE cycle_id=v_cycle.id;
  v_net := v_gross * (1-COALESCE(v_chama.commission_rate,0.05));
  RETURN jsonb_build_object('success',true,'cycle_id',v_cycle.id,'cycle_number',v_cycle.cycle_number,
    'cycle_end',v_cycle.end_date,'beneficiary_member_id',v_cycle.beneficiary_member_id,
    'paid_count',v_paid,'total_members',v_total,'collected_gross',v_gross,'collected_net',round(v_net,2),
    'target_gross',v_total*v_chama.contribution_amount,
    'target_net',round(v_total*v_chama.contribution_amount*(1-COALESCE(v_chama.commission_rate,0.05)),2),
    'contribution_amount',v_chama.contribution_amount,'commission_rate',COALESCE(v_chama.commission_rate,0.05));
END;
$$;