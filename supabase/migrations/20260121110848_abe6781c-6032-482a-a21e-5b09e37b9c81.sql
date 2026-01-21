-- Add carry-forward credit to chama_members
ALTER TABLE chama_members 
ADD COLUMN IF NOT EXISTS carry_forward_credit NUMERIC DEFAULT 0;

-- Add columns to member_cycle_payments for partial payment tracking
ALTER TABLE member_cycle_payments 
ADD COLUMN IF NOT EXISTS amount_remaining NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS fully_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_allocations JSONB DEFAULT '[]';

-- Update existing records: set fully_paid based on is_paid
UPDATE member_cycle_payments 
SET fully_paid = is_paid,
    amount_remaining = CASE WHEN is_paid THEN 0 ELSE COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) END
WHERE fully_paid IS NULL OR fully_paid = false;

-- Create eligibility check function
CREATE OR REPLACE FUNCTION check_member_schedule_eligibility(
  p_member_id UUID,
  p_chama_id UUID
)
RETURNS TABLE (
  is_eligible BOOLEAN,
  total_periods_owed INTEGER,
  total_amount_owed NUMERIC,
  carry_forward NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (COUNT(*) FILTER (WHERE NOT COALESCE(mcp.fully_paid, false)) = 0) as is_eligible,
    COUNT(*) FILTER (WHERE NOT COALESCE(mcp.fully_paid, false))::INTEGER as total_periods_owed,
    COALESCE(SUM(COALESCE(mcp.amount_due, 0) - COALESCE(mcp.amount_paid, 0)) FILTER (WHERE NOT COALESCE(mcp.fully_paid, false)), 0) as total_amount_owed,
    COALESCE(cm.carry_forward_credit, 0) as carry_forward
  FROM chama_members cm
  LEFT JOIN member_cycle_payments mcp ON mcp.member_id = cm.id
  WHERE cm.id = p_member_id
  AND cm.chama_id = p_chama_id
  GROUP BY cm.id, cm.carry_forward_credit;
END;
$$;