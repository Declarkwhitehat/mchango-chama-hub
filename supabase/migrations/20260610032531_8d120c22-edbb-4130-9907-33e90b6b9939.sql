-- ============ FIX 1: Keumbu Bodaboda payable amount ============
-- The RPC double-counts: unpaid member_cycle_payments rows AND chama_member_debts
-- both track the same missed contribution. Subtract debt principal that already
-- covers each cycle so the total is not inflated (was 40, should be 22).
CREATE OR REPLACE FUNCTION public.get_member_live_outstanding(p_member_id uuid, p_chama_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_unpaid_cycles_amount numeric := 0;
  v_unpaid_cycle_count int := 0;
  v_debt_principal numeric := 0;
  v_debt_penalty numeric := 0;
  v_debt_count int := 0;
  v_carry numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  IF NOT (
    has_role(v_uid, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM chama_members
       WHERE chama_id = p_chama_id AND user_id = v_uid
         AND approval_status = 'approved'
    )
  ) THEN
    RETURN jsonb_build_object('error','Forbidden');
  END IF;

  -- Net unpaid contributions, EXCLUDING what is already tracked as debt for the
  -- same cycle (debts are created when a cycle closes unpaid and supersede the
  -- raw member_cycle_payments row).
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

-- Mark the orphan unpaid member_cycle_payments row for Keumbu Bodaboda member
-- X2WSM0004 (cycle #2) as fully paid because the same KES 20 is now tracked
-- via chama_member_debts (principal 20 + penalty 2 = 22 total payable).
UPDATE member_cycle_payments
   SET fully_paid = true,
       amount_paid = amount_due
 WHERE id = '32c9b60d-c445-4011-b76a-63cbbc2c0a7d';

-- ============ FIX 3: Verified-creator entities require admin approval ============
-- Old behaviour: trigger flipped is_verified=true automatically.
-- New: only flag creator_is_verified for downstream display; CRUD functions
-- will create a verification_request row so admin can review and approve.
CREATE OR REPLACE FUNCTION public.apply_creator_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_verified boolean;
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(is_verified, false) INTO v_verified FROM profiles WHERE id = NEW.created_by;
  IF v_verified THEN
    BEGIN
      NEW.creator_is_verified := true;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
    -- DO NOT auto-flip is_verified. Admin must approve via verification_requests.
  END IF;
  RETURN NEW;
END;
$function$;