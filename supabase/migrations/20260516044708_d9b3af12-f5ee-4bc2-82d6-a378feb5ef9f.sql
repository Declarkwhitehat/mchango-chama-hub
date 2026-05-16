CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(p_withdrawal_id uuid, p_mpesa_receipt text, p_transaction_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal withdrawals%ROWTYPE;
  v_effective_amount NUMERIC;
  v_updated_rows INTEGER := 0;
  v_duplicate_withdrawal_id UUID;
BEGIN
  SELECT *
  INTO v_withdrawal
  FROM withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF p_mpesa_receipt IS NOT NULL AND btrim(p_mpesa_receipt) <> '' THEN
    SELECT id
    INTO v_duplicate_withdrawal_id
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
    RETURN jsonb_build_object(
      'success', true,
      'already_completed', true,
      'message', 'Withdrawal already completed'
    );
  END IF;

  IF v_withdrawal.status NOT IN ('processing', 'pending_retry', 'approved') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid withdrawal status: ' || v_withdrawal.status
    );
  END IF;

  -- Always deduct the gross approved outflow (withdrawal.amount), NOT the
  -- recipient-received amount. The M-Pesa B2C fee is paid out of the entity's
  -- balance, so the entity must lose the full `amount` it approved.
  v_effective_amount := COALESCE(v_withdrawal.amount, v_withdrawal.net_amount, p_transaction_amount);

  IF v_effective_amount IS NULL OR v_effective_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid transaction amount');
  END IF;

  IF v_withdrawal.mchango_id IS NOT NULL THEN
    UPDATE mchango
    SET
      available_balance = available_balance - v_effective_amount,
      current_amount = GREATEST(0, COALESCE(current_amount, available_balance) - v_effective_amount)
    WHERE id = v_withdrawal.mchango_id
      AND COALESCE(available_balance, 0) >= v_effective_amount;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  ELSIF v_withdrawal.organization_id IS NOT NULL THEN
    UPDATE organizations
    SET
      available_balance = available_balance - v_effective_amount,
      current_amount = GREATEST(0, COALESCE(current_amount, available_balance) - v_effective_amount)
    WHERE id = v_withdrawal.organization_id
      AND COALESCE(available_balance, 0) >= v_effective_amount;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  ELSIF v_withdrawal.chama_id IS NOT NULL THEN
    UPDATE chama
    SET
      available_balance = available_balance - v_effective_amount,
      total_withdrawn = COALESCE(total_withdrawn, 0) + v_effective_amount
    WHERE id = v_withdrawal.chama_id
      AND COALESCE(available_balance, 0) >= v_effective_amount;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  ELSIF v_withdrawal.welfare_id IS NOT NULL THEN
    -- Welfare balance was already deducted at cooling-off approval time.
    -- Only update total_withdrawn and current_amount here.
    UPDATE welfares
    SET
      current_amount = GREATEST(0, COALESCE(current_amount, 0) - v_effective_amount),
      total_withdrawn = COALESCE(total_withdrawn, 0) + v_effective_amount
    WHERE id = v_withdrawal.welfare_id;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal has no source entity');
  END IF;

  IF v_updated_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient available balance for completion',
      'required_amount', v_effective_amount
    );
  END IF;

  UPDATE withdrawals
  SET
    status = 'completed',
    completed_at = COALESCE(completed_at, now()),
    payment_reference = COALESCE(NULLIF(p_mpesa_receipt, ''), payment_reference)
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed', true,
    'effective_amount', v_effective_amount
  );
END;
$function$;