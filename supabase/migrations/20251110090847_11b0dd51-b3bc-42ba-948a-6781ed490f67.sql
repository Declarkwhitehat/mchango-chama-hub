-- Add 'pending' status to chama_status enum (must be in separate transaction)
ALTER TYPE chama_status ADD VALUE IF NOT EXISTS 'pending';