-- Add status tracking and payment reference columns to saving_group_deposits
ALTER TABLE saving_group_deposits
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' 
  CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
ADD COLUMN IF NOT EXISTS payment_reference TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS mpesa_receipt_number TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_reason TEXT;

-- Create index for faster payment_reference lookups
CREATE INDEX IF NOT EXISTS idx_deposits_payment_ref 
  ON saving_group_deposits(payment_reference);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_deposits_status 
  ON saving_group_deposits(status);

-- Add comment explaining the status column
COMMENT ON COLUMN saving_group_deposits.status IS 'Payment status: pending (waiting for M-Pesa), completed (payment successful), failed (payment failed), cancelled (user cancelled)';
COMMENT ON COLUMN saving_group_deposits.payment_reference IS 'M-Pesa CheckoutRequestID used to track payment lifecycle';
COMMENT ON COLUMN saving_group_deposits.mpesa_receipt_number IS 'M-Pesa transaction receipt number for completed payments';