-- Add retry tracking columns to saving_group_deposits
ALTER TABLE saving_group_deposits
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Add index for querying failed deposits
CREATE INDEX IF NOT EXISTS idx_deposits_failed_retries 
  ON saving_group_deposits(status, retry_count) 
  WHERE status = 'failed';

-- Add comments
COMMENT ON COLUMN saving_group_deposits.retry_count IS 'Number of retry attempts made for this deposit';
COMMENT ON COLUMN saving_group_deposits.last_retry_at IS 'Timestamp of the last retry attempt';
COMMENT ON COLUMN saving_group_deposits.max_retries IS 'Maximum number of retry attempts allowed';