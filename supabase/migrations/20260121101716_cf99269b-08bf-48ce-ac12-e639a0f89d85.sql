-- Add eligibility tracking columns to chama_members
ALTER TABLE chama_members 
ADD COLUMN IF NOT EXISTS total_contributed NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_contributions NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS contribution_status TEXT DEFAULT 'incomplete',
ADD COLUMN IF NOT EXISTS was_skipped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS skip_reason TEXT,
ADD COLUMN IF NOT EXISTS rescheduled_to_position INTEGER;

-- Create payout_skips table for audit trail
CREATE TABLE IF NOT EXISTS payout_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chama(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES chama_members(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES contribution_cycles(id) ON DELETE SET NULL,
  original_position INTEGER NOT NULL,
  new_position INTEGER,
  amount_owed NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL,
  skip_reason TEXT NOT NULL,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add columns to contribution_cycles for tracking
ALTER TABLE contribution_cycles 
ADD COLUMN IF NOT EXISTS total_expected_amount NUMERIC,
ADD COLUMN IF NOT EXISTS total_collected_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS members_paid_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS members_skipped_count INTEGER DEFAULT 0;

-- Enable RLS on payout_skips
ALTER TABLE payout_skips ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payout_skips
CREATE POLICY "Admins can manage payout skips"
ON payout_skips FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members can view their chama payout skips"
ON payout_skips FOR SELECT
USING (EXISTS (
  SELECT 1 FROM chama_members
  WHERE chama_members.chama_id = payout_skips.chama_id
  AND chama_members.user_id = auth.uid()
  AND chama_members.approval_status = 'approved'
));

CREATE POLICY "Managers can view payout skips"
ON payout_skips FOR SELECT
USING (EXISTS (
  SELECT 1 FROM chama_members
  WHERE chama_members.chama_id = payout_skips.chama_id
  AND chama_members.user_id = auth.uid()
  AND chama_members.is_manager = true
  AND chama_members.status = 'active'
));

-- Function to update member's total_contributed when a contribution is made
CREATE OR REPLACE FUNCTION update_member_contribution_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE chama_members
    SET total_contributed = COALESCE(total_contributed, 0) + NEW.amount,
        contribution_status = CASE 
          WHEN COALESCE(total_contributed, 0) + NEW.amount >= expected_contributions THEN 'complete'
          ELSE 'incomplete'
        END
    WHERE id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for contribution updates
DROP TRIGGER IF EXISTS trigger_update_contribution_totals ON contributions;
CREATE TRIGGER trigger_update_contribution_totals
AFTER INSERT OR UPDATE ON contributions
FOR EACH ROW
EXECUTE FUNCTION update_member_contribution_totals();

-- Function to calculate expected contributions for a member based on their position
CREATE OR REPLACE FUNCTION calculate_expected_contributions(p_chama_id UUID)
RETURNS void AS $$
DECLARE
  v_contribution_amount NUMERIC;
  v_member RECORD;
BEGIN
  SELECT contribution_amount INTO v_contribution_amount
  FROM chama WHERE id = p_chama_id;
  
  FOR v_member IN 
    SELECT id, order_index 
    FROM chama_members 
    WHERE chama_id = p_chama_id 
    AND status = 'active' 
    AND approval_status = 'approved'
  LOOP
    UPDATE chama_members
    SET expected_contributions = v_contribution_amount * v_member.order_index
    WHERE id = v_member.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to check member eligibility for payout
CREATE OR REPLACE FUNCTION check_member_payout_eligibility(p_member_id UUID)
RETURNS TABLE(
  is_eligible BOOLEAN,
  required_amount NUMERIC,
  contributed_amount NUMERIC,
  shortfall NUMERIC
) AS $$
DECLARE
  v_member RECORD;
  v_required NUMERIC;
  v_contributed NUMERIC;
BEGIN
  SELECT cm.*, c.contribution_amount 
  INTO v_member
  FROM chama_members cm
  JOIN chama c ON c.id = cm.chama_id
  WHERE cm.id = p_member_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;
  
  v_required := v_member.contribution_amount * v_member.order_index;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_contributed
  FROM contributions
  WHERE member_id = p_member_id
  AND status = 'completed';
  
  RETURN QUERY SELECT 
    v_contributed >= v_required,
    v_required,
    v_contributed,
    GREATEST(v_required - v_contributed, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable realtime for payout_skips
ALTER PUBLICATION supabase_realtime ADD TABLE payout_skips;