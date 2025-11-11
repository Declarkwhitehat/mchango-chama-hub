-- Create enum for payment method types
CREATE TYPE payment_method_type AS ENUM ('mpesa', 'airtel_money', 'bank_account');

-- Create payment_methods table
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method_type payment_method_type NOT NULL,
  
  -- For mobile money (M-Pesa, Airtel Money)
  phone_number TEXT,
  
  -- For bank accounts
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  
  -- Metadata
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_phone CHECK (
    (method_type IN ('mpesa', 'airtel_money') AND phone_number IS NOT NULL) OR
    (method_type = 'bank_account' AND bank_name IS NOT NULL AND account_number IS NOT NULL)
  )
);

-- Add payment_details_completed to profiles
ALTER TABLE profiles 
ADD COLUMN payment_details_completed BOOLEAN DEFAULT false;

-- Enable RLS
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own payment methods"
ON payment_methods
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment methods"
ON payment_methods
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND (SELECT COUNT(*) FROM payment_methods WHERE user_id = auth.uid()) < 3
);

CREATE POLICY "Users can update their own payment methods"
ON payment_methods
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payment methods"
ON payment_methods
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all payment methods"
ON payment_methods
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to ensure only one default payment method
CREATE OR REPLACE FUNCTION enforce_single_default_payment_method()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE payment_methods
    SET is_default = false
    WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_one_default_payment_method
BEFORE INSERT OR UPDATE ON payment_methods
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION enforce_single_default_payment_method();

-- Trigger for updated_at
CREATE TRIGGER update_payment_methods_updated_at
BEFORE UPDATE ON payment_methods
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();