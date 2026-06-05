CREATE OR REPLACE FUNCTION public.recompute_chama_member_balance(p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chama_id uuid;
  v_principal_outstanding numeric := 0;
  v_penalty_outstanding numeric := 0;
  v_unpaid_count int := 0;
BEGIN
  SELECT chama_id INTO v_chama_id FROM chama_members WHERE id = p_member_id;
  IF v_chama_id IS NULL THEN RETURN; END IF;

  -- Only consider cycles whose deadline (end_date) has already passed.
  -- An open cycle is not a "missed" payment and must not contribute to
  -- balance_deficit / missed_payments_count until its deadline elapses.
  WITH cycles AS (
    SELECT cc.id AS cycle_id
      FROM contribution_cycles cc
     WHERE cc.chama_id = v_chama_id
       AND cc.end_date <= now()
  ),
  per_cycle AS (
    SELECT
      c.cycle_id,
      GREATEST(
        COALESCE((SELECT GREATEST(COALESCE(mcp.amount_due,0) - COALESCE(mcp.amount_paid,0), 0)
                    FROM member_cycle_payments mcp
                   WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = p_member_id), 0),
        COALESCE((SELECT SUM(d.principal_remaining)
                    FROM chama_member_debts d
                   WHERE d.cycle_id = c.cycle_id AND d.member_id = p_member_id
                     AND d.status IN ('outstanding','partial')), 0)
      ) AS principal_out,
      COALESCE((SELECT SUM(d.penalty_remaining)
                  FROM chama_member_debts d
                 WHERE d.cycle_id = c.cycle_id AND d.member_id = p_member_id
                   AND d.status IN ('outstanding','partial')), 0) AS penalty_out
    FROM cycles c
  )
  SELECT COALESCE(SUM(principal_out), 0),
         COALESCE(SUM(penalty_out), 0),
         COUNT(*) FILTER (WHERE principal_out > 0)
    INTO v_principal_outstanding, v_penalty_outstanding, v_unpaid_count
    FROM per_cycle;

  UPDATE chama_members
     SET balance_deficit = v_principal_outstanding + v_penalty_outstanding,
         missed_payments_count = v_unpaid_count
   WHERE id = p_member_id;
END;
$function$;

-- Heal currently-broken rows: any member whose deficit/missed counts were
-- inflated by an OPEN cycle should be recomputed now.
DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN
    SELECT DISTINCT cm.id
      FROM chama_members cm
      JOIN contribution_cycles cc ON cc.chama_id = cm.chama_id
     WHERE cc.end_date > now()
       AND (cm.balance_deficit > 0 OR cm.missed_payments_count > 0)
  LOOP
    PERFORM public.recompute_chama_member_balance(m.id);
  END LOOP;
END $$;