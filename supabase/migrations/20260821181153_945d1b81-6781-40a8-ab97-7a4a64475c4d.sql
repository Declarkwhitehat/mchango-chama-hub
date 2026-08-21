DO $migration$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_member_dashboard'
     AND pg_get_function_identity_arguments(p.oid) = 'p_chama_id uuid';

  IF fn IS NULL THEN
    RAISE EXCEPTION 'get_member_dashboard(uuid) not found';
  END IF;

  fn := replace(
    fn,
    $$        'amount_due', v_current_payment.amount_due,
        'paid_at', v_current_payment.paid_at$$,
    $$        'amount_due', v_current_payment.amount_due,
        'amount_remaining', GREATEST(COALESCE(v_current_payment.amount_due, 0) - COALESCE(v_current_payment.amount_paid, 0), 0),
        'end_date', v_current_cycle.end_date,
        'paid_at', v_current_payment.paid_at$$
  );

  fn := replace(
    fn,
    $$       WHERE cc.chama_id = p_chama_id
    ),
    per_cycle AS ($$,
    $$       WHERE cc.chama_id = p_chama_id
         AND cc.end_date < now()
    ),
    per_cycle AS ($$
  );

  EXECUTE fn;
END
$migration$;