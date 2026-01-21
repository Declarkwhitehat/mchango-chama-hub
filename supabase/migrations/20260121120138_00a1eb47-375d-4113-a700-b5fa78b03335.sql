-- Create a trigger function to auto-create M-Pesa payment method when KYC is approved
CREATE OR REPLACE FUNCTION public.auto_create_mpesa_payment_method()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if KYC status is changing to 'approved'
  IF NEW.kyc_status = 'approved' AND (OLD.kyc_status IS NULL OR OLD.kyc_status != 'approved') THEN
    -- Check if user already has payment methods
    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE user_id = NEW.id) THEN
      -- Create M-Pesa payment method using registration phone
      INSERT INTO payment_methods (user_id, method_type, phone_number, is_default, is_verified)
      VALUES (NEW.id, 'mpesa', NEW.phone, true, true);
      
      -- Mark payment details as completed
      NEW.payment_details_completed := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger on profiles table
DROP TRIGGER IF EXISTS trigger_auto_create_mpesa_payment ON profiles;
CREATE TRIGGER trigger_auto_create_mpesa_payment
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_mpesa_payment_method();