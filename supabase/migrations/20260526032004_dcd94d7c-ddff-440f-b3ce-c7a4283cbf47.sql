
-- 1) Reconciliation alerts table for admin attention
CREATE TABLE IF NOT EXISTS public.withdrawal_reconciliation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  required_amount numeric,
  available_balance numeric,
  details jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wra_withdrawal ON public.withdrawal_reconciliation_alerts(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_wra_open ON public.withdrawal_reconciliation_alerts(acknowledged, created_at);

ALTER TABLE public.withdrawal_reconciliation_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read reconciliation alerts" ON public.withdrawal_reconciliation_alerts;
CREATE POLICY "Admins read reconciliation alerts"
  ON public.withdrawal_reconciliation_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update reconciliation alerts" ON public.withdrawal_reconciliation_alerts;
CREATE POLICY "Admins update reconciliation alerts"
  ON public.withdrawal_reconciliation_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) Rewrite process_withdrawal_completion: never fail a successful Safaricom callback
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(
  p_withdrawal_id uuid,
  p_mpesa_receipt text,
  p_transaction_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal withdrawals%ROWTYPE;
  v_effective_amount numeric;
  v_duplicate_withdrawal_id uuid;
  v_available numeric := 0;
  v_deduct numeric;
  v_shortfall numeric := 0;
BEGIN
  SELECT * INTO v_withdrawal FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Idempotency: don't process the same Safaricom receipt twice
  IF p_mpesa_receipt IS NOT NULL AND btrim(p_mpesa_receipt) <> '' THEN
    SELECT id INTO v_duplicate_withdrawal_id
      FROM withdrawals
     WHERE payment_reference = p_mpesa_receipt
       AND status = 'completed'
       AND id <> p_withdrawal_id
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_completed', true,
        'message', 'Transaction already processed by another withdrawal',
        'duplicate_withdrawal_id', v_duplicate_withdrawal_id
      );
    END IF;
  END IF;

  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  v_effective_amount := COALESCE(v_withdrawal.amount, v_withdrawal.net_amount, p_transaction_amount);
  IF v_effective_amount IS NULL OR v_effective_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid transaction amount');
  END IF;

  -- Deduct from source. If short, clamp deduction to available and create an alert.
  -- We DO NOT return an error here because Safaricom already disbursed the cash.
  IF v_withdrawal.mchango_id IS NOT NULL THEN
    SELECT COALESCE(available_balance, 0) INTO v_available FROM mchango WHERE id = v_withdrawal.mchango_id FOR UPDATE;
    v_deduct := LEAST(v_effective_amount, GREATEST(v_available, 0));
    v_shortfall := GREATEST(v_effective_amount - v_deduct, 0);
    UPDATE mchango
       SET available_balance = COALESCE(available_balance, 0) - v_deduct,
           current_amount = GREATEST(0, COALESCE(current_amount, available_balance) - v_deduct)
     WHERE id = v_withdrawal.mchango_id;

  ELSIF v_withdrawal.organization_id IS NOT NULL THEN
    SELECT COALESCE(available_balance, 0) INTO v_available FROM organizations WHERE id = v_withdrawal.organization_id FOR UPDATE;
    v_deduct := LEAST(v_effective_amount, GREATEST(v_available, 0));
    v_shortfall := GREATEST(v_effective_amount - v_deduct, 0);
    UPDATE organizations
       SET available_balance = COALESCE(available_balance, 0) - v_deduct,
           current_amount = GREATEST(0, COALESCE(current_amount, available_balance) - v_deduct)
     WHERE id = v_withdrawal.organization_id;

  ELSIF v_withdrawal.chama_id IS NOT NULL THEN
    SELECT COALESCE(available_balance, 0) INTO v_available FROM chama WHERE id = v_withdrawal.chama_id FOR UPDATE;
    v_deduct := LEAST(v_effective_amount, GREATEST(v_available, 0));
    v_shortfall := GREATEST(v_effective_amount - v_deduct, 0);
    UPDATE chama
       SET available_balance = COALESCE(available_balance, 0) - v_deduct,
           total_withdrawn = COALESCE(total_withdrawn, 0) + v_effective_amount
     WHERE id = v_withdrawal.chama_id;

  ELSIF v_withdrawal.welfare_id IS NOT NULL THEN
    -- Welfare balance was already deducted at cooling-off approval time.
    v_deduct := v_effective_amount;
    v_shortfall := 0;
    UPDATE welfares
       SET current_amount = GREATEST(0, COALESCE(current_amount, 0) - v_effective_amount),
           total_withdrawn = COALESCE(total_withdrawn, 0) + v_effective_amount
     WHERE id = v_withdrawal.welfare_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal has no source entity');
  END IF;

  -- ALWAYS mark completed when Safaricom confirmed disbursement
  UPDATE withdrawals
     SET status = 'completed',
         completed_at = COALESCE(completed_at, now()),
         payment_reference = COALESCE(NULLIF(p_mpesa_receipt, ''), payment_reference)
   WHERE id = p_withdrawal_id;

  -- Raise alert for shortfall so admins can reconcile
  IF v_shortfall > 0 THEN
    INSERT INTO public.withdrawal_reconciliation_alerts(
      withdrawal_id, alert_type, severity, required_amount, available_balance, details
    ) VALUES (
      p_withdrawal_id,
      'shortfall_on_successful_callback',
      'high',
      v_effective_amount,
      v_available,
      jsonb_build_object(
        'mpesa_receipt', p_mpesa_receipt,
        'transaction_amount', p_transaction_amount,
        'shortfall', v_shortfall,
        'note', 'Safaricom disbursed funds but source balance was insufficient. Deduction was clamped to available.'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'completed', true,
    'effective_amount', v_effective_amount,
    'shortfall', v_shortfall
  );
END;
$function$;

-- 3) Recompute: dedup per-cycle overlap of mcp & debts; penalty only from debts
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

  -- Per-cycle outstanding principal = GREATEST(mcp_remaining, debt_principal_remaining)
  -- We compute over all cycles for this member in this chama.
  WITH cycles AS (
    SELECT cc.id AS cycle_id
      FROM contribution_cycles cc
     WHERE cc.chama_id = v_chama_id
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

-- 4) Update get_member_dashboard with the same dedup logic
CREATE OR REPLACE FUNCTION public.get_member_dashboard(p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member record;
  v_chama record;
  v_member_count int;
  v_current_cycle record;
  v_current_payment record;
  v_current_cycle_json jsonb := NULL;
  v_payout record;
  v_payout_json jsonb := NULL;
  v_contributions jsonb;
  v_missed jsonb;
  v_principal_outstanding numeric := 0;
  v_penalty_outstanding numeric := 0;
  v_unpaid_count int := 0;
  v_total_outstanding numeric := 0;
  v_removal record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  SELECT cm.*, p.full_name, p.email, p.phone
    INTO v_member
    FROM chama_members cm
    LEFT JOIN profiles p ON p.id = cm.user_id
   WHERE cm.chama_id = p_chama_id AND cm.user_id = v_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Not a member','details','You are not a member of this chama');
  END IF;

  IF v_member.approval_status <> 'approved' THEN
    RETURN jsonb_build_object('error','Pending approval',
      'details','Your membership request is still pending approval',
      'approval_status', v_member.approval_status);
  END IF;

  IF v_member.status = 'removed' THEN
    SELECT * INTO v_removal FROM chama_member_removals
     WHERE member_id = v_member.id ORDER BY removed_at DESC LIMIT 1;
    SELECT * INTO v_chama FROM chama WHERE id = p_chama_id;
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'is_removed', true,
        'member', jsonb_build_object(
          'id', v_member.id,
          'full_name', v_member.full_name,
          'member_code', v_member.member_code,
          'removal_reason', COALESCE(v_member.removal_reason, v_removal.removal_reason, 'Removed due to consecutive missed payments'),
          'removed_at', COALESCE(v_member.removed_at, v_removal.removed_at)
        ),
        'chama', jsonb_build_object('name', COALESCE(v_chama.name, 'Unknown'))
      )
    );
  END IF;

  SELECT * INTO v_chama FROM chama WHERE id = p_chama_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Chama not found');
  END IF;

  SELECT COUNT(*) INTO v_member_count
    FROM chama_members
   WHERE chama_id = p_chama_id AND approval_status = 'approved';

  SELECT * INTO v_current_cycle
    FROM contribution_cycles
   WHERE chama_id = p_chama_id
     AND start_date <= now() AND end_date >= now()
   LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_current_payment
      FROM member_cycle_payments
     WHERE member_id = v_member.id AND cycle_id = v_current_cycle.id
     LIMIT 1;
    IF FOUND THEN
      v_current_cycle_json := jsonb_build_object(
        'is_paid', v_current_payment.is_paid,
        'amount_paid', v_current_payment.amount_paid,
        'amount_due', v_current_payment.amount_due,
        'paid_at', v_current_payment.paid_at
      );
    END IF;
  END IF;

  BEGIN
    SELECT * INTO v_payout FROM get_member_payout_position(v_member.id);
    IF FOUND AND v_payout.position_in_queue IS NOT NULL THEN
      v_payout_json := jsonb_build_object(
        'position_in_queue', v_payout.position_in_queue,
        'estimated_payout_date', v_payout.estimated_payout_date,
        'estimated_amount', v_payout.estimated_amount
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_payout_json := NULL;
  END;

  -- Payment history: include all contributions for this member (including
  -- ones paid by another member). Surface payer info for the UI.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', c.id,
            'amount', c.amount,
            'status', c.status,
            'contribution_date', c.contribution_date,
            'created_at', c.created_at,
            'payment_reference', c.payment_reference,
            'mpesa_receipt_number', c.mpesa_receipt_number,
            'payment_notes', c.payment_notes,
            'paid_by_member_id', c.paid_by_member_id,
            'paid_by_self', (c.paid_by_member_id IS NULL OR c.paid_by_member_id = v_member.id),
            'payer_member_code', payer.member_code,
            'payer_full_name', payer_p.full_name
          ) ORDER BY c.contribution_date DESC), '[]'::jsonb)
    INTO v_contributions
    FROM contributions c
    LEFT JOIN chama_members payer ON payer.id = c.paid_by_member_id
    LEFT JOIN profiles payer_p ON payer_p.id = payer.user_id
   WHERE c.chama_id = p_chama_id AND c.member_id = v_member.id;

  -- Per-cycle outstanding (dedup mcp/debt overlap)
  WITH cycles AS (
    SELECT cc.id AS cycle_id, cc.cycle_number, cc.start_date, cc.end_date, cc.due_amount
      FROM contribution_cycles cc
     WHERE cc.chama_id = p_chama_id
  ),
  per_cycle AS (
    SELECT
      c.cycle_id, c.cycle_number, c.start_date, c.end_date, c.due_amount,
      COALESCE((SELECT mcp.amount_due
                  FROM member_cycle_payments mcp
                 WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = v_member.id), c.due_amount, 0) AS amount_due,
      COALESCE((SELECT mcp.amount_paid
                  FROM member_cycle_payments mcp
                 WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = v_member.id), 0) AS amount_paid,
      GREATEST(
        COALESCE((SELECT GREATEST(COALESCE(mcp.amount_due,0) - COALESCE(mcp.amount_paid,0), 0)
                    FROM member_cycle_payments mcp
                   WHERE mcp.cycle_id = c.cycle_id AND mcp.member_id = v_member.id), 0),
        COALESCE((SELECT SUM(d.principal_remaining)
                    FROM chama_member_debts d
                   WHERE d.cycle_id = c.cycle_id AND d.member_id = v_member.id
                     AND d.status IN ('outstanding','partial')), 0)
      ) AS principal_out,
      COALESCE((SELECT SUM(d.penalty_remaining)
                  FROM chama_member_debts d
                 WHERE d.cycle_id = c.cycle_id AND d.member_id = v_member.id
                   AND d.status IN ('outstanding','partial')), 0) AS penalty_out
    FROM cycles c
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'cycle_number', cycle_number,
      'start_date', start_date,
      'end_date', end_date,
      'amount_due', amount_due,
      'amount_paid', amount_paid,
      'amount_remaining', principal_out,
      'penalty_remaining', penalty_out
    ) ORDER BY cycle_number) FILTER (WHERE principal_out > 0 OR penalty_out > 0), '[]'::jsonb),
    COALESCE(SUM(principal_out), 0),
    COALESCE(SUM(penalty_out), 0),
    COUNT(*) FILTER (WHERE principal_out > 0)
  INTO v_missed, v_principal_outstanding, v_penalty_outstanding, v_unpaid_count
  FROM per_cycle;

  v_total_outstanding := v_principal_outstanding + v_penalty_outstanding;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'member', jsonb_build_object(
        'id', v_member.id,
        'full_name', v_member.full_name,
        'email', v_member.email,
        'phone', v_member.phone,
        'member_code', v_member.member_code,
        'joined_at', v_member.joined_at,
        'order_index', v_member.order_index,
        'balance_credit', COALESCE(v_member.balance_credit,0),
        'balance_deficit', v_total_outstanding,
        'missed_payments_count', v_unpaid_count,
        'total_outstanding', v_total_outstanding,
        'debt_principal_remaining', v_principal_outstanding,
        'debt_penalty_remaining', v_penalty_outstanding,
        'last_payment_date', v_member.last_payment_date,
        'next_due_date', v_member.next_due_date,
        'status', v_member.status,
        'frozen_amount_due', v_member.frozen_amount_due,
        'frozen_unfreeze_fee', v_member.frozen_unfreeze_fee
      ),
      'missed_payments', v_missed,
      'chama', jsonb_build_object(
        'name', v_chama.name,
        'contribution_amount', v_chama.contribution_amount,
        'contribution_frequency', v_chama.contribution_frequency,
        'commission_rate', COALESCE(v_chama.commission_rate, 0.05),
        'every_n_days_count', v_chama.every_n_days_count,
        'member_count', v_member_count,
        'status', v_chama.status,
        'start_date', v_chama.start_date
      ),
      'current_cycle', v_current_cycle_json,
      'payment_history', v_contributions,
      'payout_schedule', v_payout_json
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_dashboard(uuid) TO authenticated;

-- 5) Trigger: auto-recompute balance on debt or mcp changes
CREATE OR REPLACE FUNCTION public.trg_recompute_balance_on_debt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid;
BEGIN
  v_member_id := COALESCE(NEW.member_id, OLD.member_id);
  IF v_member_id IS NOT NULL THEN
    PERFORM public.recompute_chama_member_balance(v_member_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_chama_member_debts_recompute ON public.chama_member_debts;
CREATE TRIGGER trg_chama_member_debts_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.chama_member_debts
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_balance_on_debt();

DROP TRIGGER IF EXISTS trg_mcp_recompute ON public.member_cycle_payments;
CREATE TRIGGER trg_mcp_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.member_cycle_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_balance_on_debt();
