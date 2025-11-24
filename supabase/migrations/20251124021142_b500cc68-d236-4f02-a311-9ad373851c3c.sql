-- Phase 1: Database Schema Updates for Chama Cycle Restart

-- Add cycle tracking columns to chama table
ALTER TABLE chama 
ADD COLUMN IF NOT EXISTS current_cycle_round INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_cycle_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS accepting_rejoin_requests BOOLEAN DEFAULT false;

-- Create cycle history tracking table
CREATE TABLE IF NOT EXISTS chama_cycle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chama(id) ON DELETE CASCADE,
  cycle_round INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  total_members INTEGER NOT NULL,
  total_payouts_made INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on cycle history
ALTER TABLE chama_cycle_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for cycle history
CREATE POLICY "Members can view their chama cycle history"
  ON chama_cycle_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chama_members
      WHERE chama_members.chama_id = chama_cycle_history.chama_id
        AND chama_members.user_id = auth.uid()
        AND chama_members.approval_status = 'approved'
    )
  );

CREATE POLICY "Admins can view all cycle history"
  ON chama_cycle_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create rejoin requests table
CREATE TABLE IF NOT EXISTS chama_rejoin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id UUID NOT NULL REFERENCES chama(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  previous_member_id UUID REFERENCES chama_members(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(chama_id, user_id, status)
);

-- Enable RLS on rejoin requests
ALTER TABLE chama_rejoin_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for rejoin requests
CREATE POLICY "Members can submit rejoin requests"
  ON chama_rejoin_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can view own rejoin requests"
  ON chama_rejoin_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all rejoin requests for their chamas"
  ON chama_rejoin_requests FOR SELECT
  USING (is_chama_manager(auth.uid(), chama_id));

CREATE POLICY "Managers can update rejoin requests"
  ON chama_rejoin_requests FOR UPDATE
  USING (is_chama_manager(auth.uid(), chama_id));

CREATE POLICY "Admins can manage all rejoin requests"
  ON chama_rejoin_requests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add 'cycle_complete' to chama_status enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chama_status' AND 'cycle_complete' = ANY(enum_range(NULL::chama_status)::text[])) THEN
    ALTER TYPE chama_status ADD VALUE IF NOT EXISTS 'cycle_complete';
  END IF;
END $$;