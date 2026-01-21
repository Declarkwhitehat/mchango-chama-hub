-- Add position swap tracking columns to chama_members
ALTER TABLE chama_members 
ADD COLUMN IF NOT EXISTS original_order_index INTEGER,
ADD COLUMN IF NOT EXISTS position_swapped_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS swapped_with_member_id UUID REFERENCES chama_members(id);

-- Add swap tracking to payout_skips
ALTER TABLE payout_skips
ADD COLUMN IF NOT EXISTS swap_performed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS swapped_with_member_id UUID REFERENCES chama_members(id),
ADD COLUMN IF NOT EXISTS original_withdrawal_id UUID REFERENCES withdrawals(id),
ADD COLUMN IF NOT EXISTS new_withdrawal_id UUID REFERENCES withdrawals(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chama_members_swapped ON chama_members(swapped_with_member_id) WHERE swapped_with_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_skips_swap ON payout_skips(swap_performed) WHERE swap_performed = true;