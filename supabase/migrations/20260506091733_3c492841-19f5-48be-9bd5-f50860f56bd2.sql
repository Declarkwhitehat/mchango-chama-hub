
-- 1) cleanup_failed_transactions: mirrors the Edge Function exactly
CREATE OR REPLACE FUNCTION public.cleanup_failed_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '12 hours';
BEGIN
  DELETE FROM public.contributions
   WHERE status = 'FAILED' AND created_at < v_cutoff;

  DELETE FROM public.mchango_donations
   WHERE payment_status = 'failed' AND created_at < v_cutoff;

  DELETE FROM public.withdrawals
   WHERE status = 'failed' AND created_at < v_cutoff;

  BEGIN
    DELETE FROM public.transactions
     WHERE status = 'failed' AND created_at < v_cutoff;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END;
$$;

-- 2) compute_trust_scores: set-based port of the Edge Function logic
CREATE OR REPLACE FUNCTION public.compute_trust_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH approved_members AS (
    SELECT id, user_id, chama_id
      FROM public.chama_members
     WHERE user_id IS NOT NULL
       AND approval_status = 'approved'
  ),
  user_member_ids AS (
    SELECT user_id, array_agg(id) AS member_ids, array_agg(DISTINCT chama_id) AS chama_ids
      FROM approved_members
     GROUP BY user_id
  ),
  payment_stats AS (
    SELECT am.user_id,
           COUNT(mcp.*) FILTER (WHERE mcp.fully_paid AND NOT COALESCE(mcp.is_late_payment,false)) AS on_time,
           COUNT(mcp.*) FILTER (WHERE mcp.fully_paid AND COALESCE(mcp.is_late_payment,false))    AS late,
           COUNT(mcp.*) FILTER (WHERE NOT COALESCE(mcp.fully_paid,false) AND NOT COALESCE(mcp.is_paid,false)) AS missed,
           COUNT(mcp.*) AS total
      FROM approved_members am
      LEFT JOIN public.member_cycle_payments mcp ON mcp.member_id = am.id
     GROUP BY am.user_id
  ),
  debt_stats AS (
    SELECT am.user_id, COUNT(d.*) AS outstanding
      FROM approved_members am
      LEFT JOIN public.chama_member_debts d
             ON d.member_id = am.id AND d.status IN ('outstanding','partial')
     GROUP BY am.user_id
  ),
  completed_stats AS (
    SELECT u.user_id,
           COALESCE(COUNT(DISTINCT h.chama_id),0) AS completed
      FROM user_member_ids u
      LEFT JOIN public.chama_cycle_history h ON h.chama_id = ANY(u.chama_ids)
     GROUP BY u.user_id
  ),
  scored AS (
    SELECT u.user_id,
           cs.completed,
           ps.on_time,
           ps.late,
           ps.missed,
           ds.outstanding,
           GREATEST(0, LEAST(100,
             (CASE WHEN ps.total = 0 THEN 50
                   ELSE ROUND((ps.on_time::numeric / ps.total) * 70)::int
              END)
             + LEAST(20, COALESCE(cs.completed,0) * 5)
             + (CASE WHEN COALESCE(ps.missed,0) = 0 AND COALESCE(ds.outstanding,0) = 0 THEN 10 ELSE 0 END)
           ))::int AS score
      FROM user_member_ids u
      LEFT JOIN payment_stats   ps ON ps.user_id = u.user_id
      LEFT JOIN debt_stats      ds ON ds.user_id = u.user_id
      LEFT JOIN completed_stats cs ON cs.user_id = u.user_id
  )
  INSERT INTO public.member_trust_scores AS mts (
    user_id, total_chamas_completed, total_on_time_payments,
    total_late_payments, total_missed_payments, total_outstanding_debts,
    trust_score, updated_at
  )
  SELECT user_id, COALESCE(completed,0), COALESCE(on_time,0),
         COALESCE(late,0), COALESCE(missed,0), COALESCE(outstanding,0),
         score, now()
    FROM scored
  ON CONFLICT (user_id) DO UPDATE SET
    total_chamas_completed  = EXCLUDED.total_chamas_completed,
    total_on_time_payments  = EXCLUDED.total_on_time_payments,
    total_late_payments     = EXCLUDED.total_late_payments,
    total_missed_payments   = EXCLUDED.total_missed_payments,
    total_outstanding_debts = EXCLUDED.total_outstanding_debts,
    trust_score             = EXCLUDED.trust_score,
    updated_at              = now();
END;
$$;

-- 3) financial_reconciliation: ports the four checks + auto-correct
CREATE OR REPLACE FUNCTION public.financial_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anomalies jsonb := '[]'::jsonb;
  v_count int := 0;
  r record;
BEGIN
  -- CHECK 1: duplicate mpesa_receipt_number on completed contributions
  FOR r IN
    SELECT mpesa_receipt_number AS receipt,
           array_agg(id::text)  AS ids,
           COUNT(*)             AS cnt
      FROM public.contributions
     WHERE status = 'completed' AND mpesa_receipt_number IS NOT NULL
     GROUP BY mpesa_receipt_number
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.reconciliation_logs(anomaly_type, entity_type, entity_id, details)
    VALUES ('duplicate_mpesa_receipt','contribution',(r.ids[1])::uuid,
            jsonb_build_object('receipt',r.receipt,'duplicate_ids',r.ids,'count',r.cnt));
    v_count := v_count + 1;
  END LOOP;

  -- CHECK 2: duplicate payment_reference on completed contributions
  FOR r IN
    SELECT payment_reference AS ref,
           array_agg(id::text) AS ids,
           COUNT(*)            AS cnt
      FROM public.contributions
     WHERE status = 'completed' AND payment_reference IS NOT NULL
     GROUP BY payment_reference
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.reconciliation_logs(anomaly_type, entity_type, entity_id, details)
    VALUES ('duplicate_payment_reference','contribution',(r.ids[1])::uuid,
            jsonb_build_object('payment_reference',r.ref,'duplicate_ids',r.ids,'count',r.cnt));
    v_count := v_count + 1;
  END LOOP;

  -- CHECK 3: chama balance drift, with auto-correct < 100
  FOR r IN
    WITH agg AS (
      SELECT c.id, c.name, COALESCE(c.available_balance,0) AS actual,
             (SELECT COALESCE(SUM(amount),0) FROM public.contributions WHERE chama_id=c.id AND status='completed')                          AS contributed,
             (SELECT COALESCE(SUM(net_amount),0) FROM public.withdrawals WHERE chama_id=c.id AND status='completed')                        AS withdrawn,
             (SELECT COALESCE(SUM(amount),0) FROM public.company_earnings WHERE group_id=c.id)                                              AS commissions
        FROM public.chama c
       WHERE c.status IN ('active','started')
    )
    SELECT id, name, actual, contributed, withdrawn, commissions,
           (contributed - commissions - withdrawn) AS expected
      FROM agg
     WHERE ABS((contributed - commissions - withdrawn) - actual) > 1
  LOOP
    INSERT INTO public.reconciliation_logs(anomaly_type, entity_type, entity_id,
      expected_value, actual_value, difference, details, auto_corrected)
    VALUES ('balance_drift','chama', r.id, r.expected, r.actual, r.expected - r.actual,
            jsonb_build_object('chama_name',r.name,'total_contributed',r.contributed,
                               'total_commissions',r.commissions,'total_withdrawn',r.withdrawn),
            ABS(r.expected - r.actual) < 100);

    IF ABS(r.expected - r.actual) < 100 THEN
      UPDATE public.chama SET available_balance = r.expected WHERE id = r.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- CHECK 4: contribution > 3x expected
  FOR r IN
    SELECT co.id, co.amount, co.chama_id, co.member_id, c.contribution_amount AS expected
      FROM public.contributions co
      JOIN public.chama c ON c.id = co.chama_id
     WHERE co.status = 'completed'
       AND c.contribution_amount > 0
       AND co.amount > c.contribution_amount * 3
  LOOP
    INSERT INTO public.reconciliation_logs(anomaly_type, entity_type, entity_id,
      expected_value, actual_value, difference, details)
    VALUES ('excessive_contribution','contribution', r.id, r.expected, r.amount, r.amount - r.expected,
            jsonb_build_object('chama_id',r.chama_id,'member_id',r.member_id));
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success',true,'anomalies_found',v_count,'run_at',now());
END;
$$;
