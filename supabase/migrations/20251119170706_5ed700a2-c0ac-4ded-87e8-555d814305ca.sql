-- 1. Extend contribution_cycles table
ALTER TABLE contribution_cycles 
ADD COLUMN IF NOT EXISTS beneficiary_member_id UUID REFERENCES chama_members(id),
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payout_processed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payout_processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payout_type TEXT CHECK (payout_type IN ('full', 'partial', 'none'));

-- 2. Extend member_cycle_payments table
ALTER TABLE member_cycle_payments 
ADD COLUMN IF NOT EXISTS payment_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_late_payment BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS credited_to_next_cycle BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- 3. Extend chama_members table
ALTER TABLE chama_members 
ADD COLUMN IF NOT EXISTS missed_payments_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS requires_admin_verification BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS next_cycle_credit NUMERIC(10,2) DEFAULT 0;

-- 4. Create function to check if all members paid
CREATE OR REPLACE FUNCTION public.check_all_members_paid(p_cycle_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_members INTEGER;
  v_paid_members INTEGER;
BEGIN
  -- Count total approved members in chama
  SELECT COUNT(*) INTO v_total_members
  FROM chama_members cm
  JOIN contribution_cycles cc ON cc.chama_id = cm.chama_id
  WHERE cc.id = p_cycle_id
    AND cm.approval_status = 'approved'
    AND cm.status = 'active';
  
  -- Count paid members for this cycle
  SELECT COUNT(*) INTO v_paid_members
  FROM member_cycle_payments
  WHERE cycle_id = p_cycle_id
    AND is_paid = true
    AND (is_late_payment = false OR is_late_payment IS NULL);
  
  RETURN v_paid_members >= v_total_members;
END;
$$;

-- 5. Create trigger function for immediate payout
CREATE OR REPLACE FUNCTION public.trigger_immediate_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if all members now paid
  IF NEW.is_paid = true AND check_all_members_paid(NEW.cycle_id) THEN
    -- Update cycle to mark as complete
    UPDATE contribution_cycles
    SET is_complete = true
    WHERE id = NEW.cycle_id
      AND payout_processed = false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 6. Create trigger on member_cycle_payments
DROP TRIGGER IF EXISTS after_payment_check_completion ON member_cycle_payments;
CREATE TRIGGER after_payment_check_completion
AFTER INSERT OR UPDATE ON member_cycle_payments
FOR EACH ROW
EXECUTE FUNCTION trigger_immediate_payout();