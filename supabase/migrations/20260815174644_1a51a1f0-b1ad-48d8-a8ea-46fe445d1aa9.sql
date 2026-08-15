-- 1. Stop the payment trigger from silently closing cycles.
CREATE OR REPLACE FUNCTION public.trigger_immediate_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Completion is a payout-time fact. Payment rows only refresh counters here;
  -- is_complete is set exclusively by the code path that creates the payout.
  IF NEW.is_paid = true THEN
    UPDATE contribution_cycles c
       SET members_paid_count = sub.paid_count,
           total_collected_amount = sub.collected
      FROM (
        SELECT COUNT(*) FILTER (WHERE COALESCE(fully_paid, is_paid, false)) AS paid_count,
               COALESCE(SUM(LEAST(COALESCE(amount_paid,0), COALESCE(amount_due,0))),0) AS collected
          FROM member_cycle_payments
         WHERE cycle_id = NEW.cycle_id
      ) sub
     WHERE c.id = NEW.cycle_id
       AND c.payout_processed = false;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Current pool must never disappear while the payout is still pending.
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

  -- Current cycle by date, still awaiting payout. is_complete is intentionally
  -- ignored so a fully-paid-but-unpaid-out cycle keeps showing its real pool.
  SELECT id,cycle_number,start_date,end_date,beneficiary_member_id
    INTO v_cycle FROM contribution_cycles
   WHERE chama_id=p_chama_id AND payout_processed=false
     AND start_date <= now() AND end_date >= now()
   ORDER BY cycle_number DESC LIMIT 1;

  IF NOT FOUND THEN
    -- Fall back to the newest cycle whose window closed but payout is pending.
    SELECT id,cycle_number,start_date,end_date,beneficiary_member_id
      INTO v_cycle FROM contribution_cycles
     WHERE chama_id=p_chama_id AND payout_processed=false AND end_date < now()
     ORDER BY cycle_number DESC LIMIT 1;
  END IF;

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