
-- Atomic function to process withdrawal completion
-- Called by b2c-callback on successful M-Pesa B2C payment
-- Handles: idempotency, status update, balance deduction, negative balance prevention
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(
  p_withdrawal_id UUID,
  p_mpesa_receipt TEXT,
  p_transaction_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_withdrawal RECORD;
  v_result JSONB;
BEGIN
  -- Lock the withdrawal row to prevent concurrent processing
  SELECT * INTO v_withdrawal
  FROM withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Idempotency: if already completed, return success without re-processing
  IF v_withdrawal.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true, 'message', 'Withdrawal was already completed');
  END IF;

  -- Only process if in a valid pre-completion state
  IF v_withdrawal.status NOT IN ('processing', 'pending_retry', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal status: ' || v_withdrawal.status);
  END IF;

  -- Update withdrawal to completed
  UPDATE withdrawals SET
    status = 'completed',
    completed_at = now(),
    payment_reference = COALESCE(p_mpesa_receipt, payment_reference),
    b2c_error_details = NULL,
    notes = COALESCE(notes, '') || E'\n[SYSTEM] Completed: receipt=' || COALESCE(p_mpesa_receipt, 'N/A') || ', amount=' || p_transaction_amount::text
  WHERE id = p_withdrawal_id;

  -- Deduct balance from the correct entity
  IF v_withdrawal.mchango_id IS NOT NULL THEN
    UPDATE mchango SET
      current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_transaction_amount),
      available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_transaction_amount)
    WHERE id = v_withdrawal.mchango_id;

  ELSIF v_withdrawal.organization_id IS NOT NULL THEN
    UPDATE organizations SET
      current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_transaction_amount),
      available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_transaction_amount)
    WHERE id = v_withdrawal.organization_id;

  ELSIF v_withdrawal.chama_id IS NOT NULL THEN
    UPDATE chama SET
      available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_transaction_amount),
      total_withdrawn = COALESCE(total_withdrawn, 0) + p_transaction_amount
    WHERE id = v_withdrawal.chama_id;

  ELSIF v_withdrawal.welfare_id IS NOT NULL THEN
    UPDATE welfares SET
      current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_transaction_amount),
      available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_transaction_amount),
      total_withdrawn = COALESCE(total_withdrawn, 0) + p_transaction_amount
    WHERE id = v_withdrawal.welfare_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'amount_deducted', p_transaction_amount,
    'entity_type', CASE
      WHEN v_withdrawal.mchango_id IS NOT NULL THEN 'mchango'
      WHEN v_withdrawal.organization_id IS NOT NULL THEN 'organization'
      WHEN v_withdrawal.chama_id IS NOT NULL THEN 'chama'
      WHEN v_withdrawal.welfare_id IS NOT NULL THEN 'welfare'
      ELSE 'unknown'
    END
  );
END;
$$;
