CREATE OR REPLACE FUNCTION public.get_member_live_outstanding(p_member_id uuid, p_chama_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), current_setting('role', true), '') = 'service_role'
                          OR current_user IN ('postgres','service_role','supabase_admin');
  v_unpaid_cycles_amount numeric := 0;
  v_unpaid_cycle_count int := 0;
  v_debt_principal numeric := 0;
  v_debt_penalty numeric := 0;
  v_debt_count int := 0;
  v_carry numeric := 0;
BEGIN
  IF v_uid IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  IF NOT v_is_service AND NOT (
    has_role(v_uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM chama_members
       WHERE chama_id = p_chama_id AND user_id = v_uid
         AND approval_status = 'approved'
    )
  ) THEN
    RETURN jsonb_build_object('error','Forbidden');
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(
      COALESCE(mcp.amount_due,0) - COALESCE(mcp.amount_paid,0)
        - COALESCE(d.principal_remaining,0), 0)),0),
    COUNT(*) FILTER (
      WHERE NOT COALESCE(mcp.fully_paid,false)
        AND GREATEST(
          COALESCE(mcp.amount_due,0) - COALESCE(mcp.amount_paid,0)
            - COALESCE(d.principal_remaining,0), 0) > 0
    )
    INTO v_unpaid_cycles_amount, v_unpaid_cycle_count
    FROM member_cycle_payments mcp
    LEFT JOIN LATERAL (
      SELECT SUM(principal_remaining) AS principal_remaining
        FROM chama_member_debts
       WHERE member_id = mcp.member_id
         AND cycle_id  = mcp.cycle_id
         AND status IN ('outstanding','partial')
    ) d ON true
   WHERE mcp.member_id = p_member_id
     AND NOT COALESCE(mcp.fully_paid,false);

  SELECT COALESCE(SUM(principal_remaining),0),
         COALESCE(SUM(penalty_remaining),0),
         COUNT(*)
    INTO v_debt_principal, v_debt_penalty, v_debt_count
    FROM chama_member_debts
   WHERE member_id = p_member_id
     AND chama_id  = p_chama_id
     AND status IN ('outstanding','partial');

  SELECT COALESCE(SUM(amount),0)
    INTO v_carry
    FROM chama_overpayment_wallet
   WHERE member_id = p_member_id
     AND chama_id  = p_chama_id
     AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'unpaid_cycles_amount',     v_unpaid_cycles_amount,
    'unpaid_cycle_count',       v_unpaid_cycle_count,
    'debt_principal_remaining', v_debt_principal,
    'debt_penalty_remaining',   v_debt_penalty,
    'debt_count',               v_debt_count,
    'wallet_credit_net',        v_carry,
    'total_outstanding_gross',         v_unpaid_cycles_amount + v_debt_principal + v_debt_penalty,
    'total_outstanding_no_penalty',    v_unpaid_cycles_amount + v_debt_principal
  );
END;
$function$;