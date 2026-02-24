
-- Add payout_deferred_count to chama_members to track how many times a member's payout was postponed
ALTER TABLE public.chama_members
ADD COLUMN IF NOT EXISTS payout_deferred_count integer DEFAULT 0;
