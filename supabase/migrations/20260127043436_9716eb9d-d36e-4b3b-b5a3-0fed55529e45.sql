-- Create function for atomic balance check and lock
-- p_amount comes first since it has no default
CREATE OR REPLACE FUNCTION public.check_and_lock_withdrawal_balance(
  p_amount NUMERIC,
  p_chama_id UUID DEFAULT NULL,
  p_mchango_id UUID DEFAULT NULL
)
RETURNS TABLE(
  can_withdraw BOOLEAN,
  available_balance NUMERIC,
  entity_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_chama_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      (c.available_balance - COALESCE(c.total_withdrawn, 0) >= p_amount) as can_withdraw,
      (c.available_balance - COALESCE(c.total_withdrawn, 0)) as available_balance,
      c.name as entity_name
    FROM chama c
    WHERE c.id = p_chama_id
    FOR UPDATE OF c;
  ELSIF p_mchango_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      (m.available_balance >= p_amount) as can_withdraw,
      m.available_balance,
      m.title as entity_name
    FROM mchango m
    WHERE m.id = p_mchango_id
    FOR UPDATE OF m;
  END IF;
END;
$$;

-- Create function to atomically update chama withdrawn amount
CREATE OR REPLACE FUNCTION public.update_chama_withdrawn(
  p_chama_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE chama
  SET total_withdrawn = COALESCE(total_withdrawn, 0) + p_amount
  WHERE id = p_chama_id;
END;
$$;

-- Create function to atomically update mchango withdrawn amount
CREATE OR REPLACE FUNCTION public.update_mchango_withdrawn(
  p_mchango_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE mchango
  SET 
    current_amount = GREATEST(0, COALESCE(current_amount, 0) - p_amount),
    available_balance = GREATEST(0, COALESCE(available_balance, 0) - p_amount)
  WHERE id = p_mchango_id;
END;
$$;