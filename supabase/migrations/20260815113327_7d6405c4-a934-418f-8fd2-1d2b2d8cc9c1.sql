CREATE OR REPLACE FUNCTION public.advance_chama_deadline(
  p_deadline timestamp with time zone,
  p_frequency text,
  p_every_n_days integer,
  p_monthly_day integer,
  p_monthly_day_2 integer,
  p_steps integer,
  p_weekly_day integer,
  p_weekly_day_2 integer
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_result timestamptz := p_deadline;
  v_kenya timestamp;
  v_year integer;
  v_month integer;
  v_day integer;
  v_first integer;
  v_second integer;
  v_dow integer;
  v_d1 integer;
  v_d2 integer;
  v_a integer;
  v_b integer;
  v_advance integer;
  i integer;
BEGIN
  IF p_steps <= 0 THEN RETURN v_result; END IF;
  FOR i IN 1..p_steps LOOP
    v_kenya := v_result AT TIME ZONE 'Africa/Nairobi';
    CASE p_frequency
      WHEN 'daily' THEN v_result := v_result + interval '1 day';
      WHEN 'weekly' THEN v_result := v_result + interval '7 days';
      WHEN 'every_n_days' THEN v_result := v_result + make_interval(days => GREATEST(COALESCE(p_every_n_days, 7), 1));
      WHEN 'twice_weekly' THEN
        v_d1 := COALESCE(p_weekly_day, 1);
        v_d2 := COALESCE(p_weekly_day_2, 4);
        IF v_d2 = v_d1 THEN v_d2 := (v_d1 + 3) % 7; END IF;
        v_dow := extract(dow FROM v_kenya)::integer;
        v_a := ((v_d1 - v_dow + 7) % 7);
        IF v_a = 0 THEN v_a := 7; END IF;
        v_b := ((v_d2 - v_dow + 7) % 7);
        IF v_b = 0 THEN v_b := 7; END IF;
        v_advance := LEAST(v_a, v_b);
        v_result := ((v_kenya::date + v_advance) + time '22:00') AT TIME ZONE 'Africa/Nairobi';
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
$function$;

CREATE OR REPLACE FUNCTION public.advance_chama_deadline(
  p_deadline timestamp with time zone,
  p_frequency text,
  p_every_n_days integer,
  p_monthly_day integer,
  p_monthly_day_2 integer,
  p_steps integer
)
RETURNS timestamp with time zone
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT public.advance_chama_deadline(p_deadline, p_frequency, p_every_n_days, p_monthly_day, p_monthly_day_2, p_steps, NULL::integer, NULL::integer);
$function$;

CREATE OR REPLACE FUNCTION public.get_member_payout_position(p_member_id uuid)
RETURNS TABLE(position_in_queue integer, estimated_payout_date timestamp with time zone, estimated_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_chama_id uuid;
  v_effective_position integer;
  v_contribution_amount numeric;
  v_frequency text;
  v_every_n_days integer;
  v_monthly_day integer;
  v_monthly_day_2 integer;
  v_weekly_day integer;
  v_weekly_day_2 integer;
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
         c.monthly_contribution_day, c.monthly_contribution_day_2,
         c.weekly_contribution_day, c.weekly_contribution_day_2, c.start_date,
         COUNT(cm.id)::integer
    INTO v_contribution_amount, v_frequency, v_every_n_days, v_monthly_day,
         v_monthly_day_2, v_weekly_day, v_weekly_day_2, v_start_date, v_member_count
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
    public.advance_chama_deadline(v_anchor, v_frequency, v_every_n_days, v_monthly_day, v_monthly_day_2, v_cycles_ahead, v_weekly_day, v_weekly_day_2),
    (v_contribution_amount * v_member_count)::numeric;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_next_due_date(p_chama_id uuid, p_last_payment_date timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_frequency text;
  v_every_n_days integer;
  v_weekly_day integer;
  v_weekly_day_2 integer;
  v_next_date timestamp with time zone;
BEGIN
  SELECT contribution_frequency, every_n_days_count, weekly_contribution_day, weekly_contribution_day_2
  INTO v_frequency, v_every_n_days, v_weekly_day, v_weekly_day_2
  FROM chama
  WHERE id = p_chama_id;

  CASE v_frequency
    WHEN 'daily' THEN
      v_next_date := p_last_payment_date + interval '1 day';
    WHEN 'weekly' THEN
      v_next_date := p_last_payment_date + interval '7 days';
    WHEN 'twice_weekly' THEN
      v_next_date := public.advance_chama_deadline(p_last_payment_date, 'twice_weekly', NULL, NULL, NULL, 1, v_weekly_day, v_weekly_day_2);
    WHEN 'monthly' THEN
      v_next_date := p_last_payment_date + interval '1 month';
    WHEN 'every_n_days' THEN
      v_next_date := p_last_payment_date + (v_every_n_days || ' days')::interval;
    ELSE
      v_next_date := p_last_payment_date + interval '7 days';
  END CASE;

  RETURN v_next_date;
END;
$function$;