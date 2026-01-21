-- Add withdrawn tracking to chama table
ALTER TABLE chama ADD COLUMN IF NOT EXISTS total_withdrawn NUMERIC DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_chama_total_withdrawn ON chama(total_withdrawn);

-- Comment for clarity
COMMENT ON COLUMN chama.total_withdrawn IS 'Total amount withdrawn from this chama pool';