-- Add 'removed' value to member_status enum
ALTER TYPE member_status ADD VALUE IF NOT EXISTS 'removed';

-- Add first payment tracking columns to chama_members
ALTER TABLE chama_members
ADD COLUMN IF NOT EXISTS first_payment_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS first_payment_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS removal_reason TEXT,
ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of unpaid members
CREATE INDEX IF NOT EXISTS idx_chama_members_first_payment 
ON chama_members(chama_id, first_payment_completed, approval_status);

-- Create audit table for member removals
CREATE TABLE IF NOT EXISTS chama_member_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chama(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  user_id UUID NOT NULL,
  removal_reason TEXT NOT NULL,
  removed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  was_manager BOOLEAN DEFAULT false,
  member_name TEXT,
  member_phone TEXT,
  chama_name TEXT,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on removals table
ALTER TABLE chama_member_removals ENABLE ROW LEVEL SECURITY;

-- RLS policies for removals table
CREATE POLICY "Admins can view all removals"
ON chama_member_removals FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view their chama removals"
ON chama_member_removals FOR SELECT
USING (EXISTS (
  SELECT 1 FROM chama_members
  WHERE chama_members.chama_id = chama_member_removals.chama_id
  AND chama_members.user_id = auth.uid()
  AND chama_members.is_manager = true
  AND chama_members.status = 'active'::member_status
));

CREATE POLICY "Members can view their own removal"
ON chama_member_removals FOR SELECT
USING (user_id = auth.uid());

-- Add start_date column to chama table if not exists
ALTER TABLE chama
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;

-- Create function to get next available order_index for a chama
CREATE OR REPLACE FUNCTION get_next_order_index(p_chama_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_next_index INTEGER;
BEGIN
  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_next_index
  FROM chama_members
  WHERE chama_id = p_chama_id
  AND order_index IS NOT NULL
  AND status != 'removed'::member_status;
  
  RETURN v_next_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to resequence order indices after removals (fill gaps)
CREATE OR REPLACE FUNCTION resequence_member_order(p_chama_id UUID)
RETURNS VOID AS $$
DECLARE
  r RECORD;
  v_new_index INTEGER := 1;
BEGIN
  FOR r IN 
    SELECT id FROM chama_members
    WHERE chama_id = p_chama_id
    AND order_index IS NOT NULL
    AND status = 'active'::member_status
    AND approval_status = 'approved'
    AND first_payment_completed = true
    ORDER BY order_index ASC
  LOOP
    UPDATE chama_members SET order_index = v_new_index WHERE id = r.id;
    v_new_index := v_new_index + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;