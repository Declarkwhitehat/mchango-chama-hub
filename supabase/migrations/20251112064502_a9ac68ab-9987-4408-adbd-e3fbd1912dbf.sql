-- Add payment method reference to withdrawals table
ALTER TABLE withdrawals 
ADD COLUMN payment_method_id UUID REFERENCES payment_methods(id),
ADD COLUMN payment_method_type payment_method_type;

-- Add index for faster lookups
CREATE INDEX idx_withdrawals_payment_method ON withdrawals(payment_method_id);

-- Create view to track daily withdrawal totals per payment method
CREATE OR REPLACE VIEW daily_withdrawal_totals AS
SELECT 
  payment_method_id,
  DATE(requested_at) as withdrawal_date,
  SUM(net_amount) as daily_total,
  COUNT(*) as transaction_count
FROM withdrawals
WHERE status IN ('pending', 'completed')
  AND requested_at >= CURRENT_DATE
GROUP BY payment_method_id, DATE(requested_at);